import { TRANSACTION_OPTIONS } from "@/lib/db/transaction";
import { prisma } from "@/lib/db/client";
import { conflict, notFound, wrongState } from "@/lib/errors.server";
import { orgWhere } from "./http";
import { deductForSale, reverseForVoid } from "./inventory";
import { recalculateTab } from "./pool";

/**
 * The operational flow: open a tab, send items to the bar, settle one combined
 * bill, and let everything downstream fall out of that.
 *
 * Two rules shape this file. Money is only ever computed here, never accepted
 * from a caller. And a tab is one bill: bar, food and pool all sit on the same
 * record so the guest sees one total, while the totals stay split internally for
 * reporting.
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export const ORDER_STATUSES = [
  "DRAFT",
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "SERVED",
  "PAYMENT_PENDING",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Which transitions a status may go to. Anything not listed is refused. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "READY", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: ["PAYMENT_PENDING", "COMPLETED", "CANCELLED"],
  PAYMENT_PENDING: ["COMPLETED", "SERVED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from as OrderStatus];
  if (!allowed) return false;
  return allowed.includes(to as OrderStatus);
}

/**
 * Next number in a club's sequence for a document kind.
 *
 * The counter is a row that is read and incremented inside the caller's
 * transaction, so two terminals taking an order at the same moment cannot both be
 * handed #1042.
 */
export async function nextDocumentNumber(
  tx: Tx,
  organizationId: string,
  branchId: string,
  kind: string,
): Promise<string> {
  const counter = await tx.dunda_document_counters.findFirst({
    where: { organization_id: organizationId, branch_id: branchId, kind },
  });

  const value = counter ? counter.next_value : 1;
  const padded = String(value).padStart(4, "0");

  if (counter) {
    await tx.dunda_document_counters.update({
      where: { id: counter.id },
      data: { next_value: { increment: 1 } },
    });
  } else {
    await tx.dunda_document_counters.create({
      data: {
        organization_id: organizationId,
        branch_id: branchId,
        kind,
        next_value: 2,
      },
    });
  }

  return `${kind}-${padded}`;
}

export interface OpenTabInput {
  organizationId: string;
  branchId: string;
  customer: string;
  table: string;
  tableId: string | null;
  customerId: string | null;
  staffId: string | null;
}

export async function openTab(input: OpenTabInput) {
  if (input.tableId) {
    const table = await prisma.dunda_tables.findFirst({
      where: orgWhere(input.organizationId, { id: input.tableId }),
      select: { id: true, status: true, name: true },
    });
    if (!table) throw notFound("That table");

    // A table that already holds an open tab is occupied. Refusing here is what
    // stops two parties being served on one table's bill by accident.
    if (table.status === "OCCUPIED" || table.status === "PAYMENT_PENDING") {
      throw conflict(`${table.name} already has an open tab.`);
    }
  }

  const number = await nextDocumentNumber(
    prisma,
    input.organizationId,
    input.branchId,
    "TAB",
  );

  return prisma.$transaction(async (tx) => {
    const tab = await tx.dunda_tabs.create({
      data: {
        organization_id: input.organizationId,
        branch_id: input.branchId,
        number,
        customer: input.customer,
        table_name: input.table,
        table_id: input.tableId,
        customer_id: input.customerId,
        staff_id: input.staffId,
        status: "OPEN",
      },
    });

    if (input.tableId) {
      await tx.dunda_tables.update({
        where: { id: input.tableId },
        data: { status: "OCCUPIED", tab_id: tab.id, customer: input.customer },
      });
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: input.organizationId,
        branch_id: input.branchId,
        staff_id: input.staffId,
        action: "CREATE",
        entity: "tab",
        entity_id: tab.id,
        detail: `${tab.number} opened for ${tab.customer} at ${tab.table_name}`,
      },
    });

    return tab;
  }, TRANSACTION_OPTIONS);
}

export interface AddTabItemInput {
  organizationId: string;
  tabId: string;
  productId: string;
  quantity: number;
  unitId: string | null;
  notes: string | null;
  staffId: string | null;
}

/**
 * Adds a line to a tab at the club's price.
 *
 * The price comes from the product, never from the request: a caller that asks
 * for a beer at a shilling would otherwise be believed.
 */
export async function addTabItem(input: AddTabItemInput) {
  return prisma.$transaction(async (tx) => {
    const tab = await tx.dunda_tabs.findFirst({
      where: orgWhere(input.organizationId, { id: input.tabId }),
    });
    if (!tab) throw notFound("That tab");
    if (tab.status !== "OPEN") throw wrongState(`Tab ${tab.number} is no longer open.`);

    const product = await tx.dunda_products.findFirst({
      where: orgWhere(input.organizationId, { id: input.productId }),
      select: {
        id: true,
        name: true,
        category: true,
        active: true,
        available: true,
        dunda_product_units: {
          where: input.unitId ? { id: input.unitId } : undefined,
          select: { id: true, name: true, selling_price: true, conversion_factor: true, is_base_unit: true },
        },
      },
    });
    if (!product) throw notFound("That product");
    if (!product.active) throw wrongState(`${product.name} is no longer sold.`);
    if (product.available !== "true") throw wrongState(`${product.name} is marked unavailable.`);

    // Prefer the unit that was chosen; otherwise the base unit, otherwise the
    // product's own price.
    const unit =
      product.dunda_product_units[0] ??
      product.dunda_product_units.find((u) => u.is_base_unit);

    const productRow = await tx.dunda_products.findUniqueOrThrow({
      where: { id: product.id },
      select: { price: true },
    });
    const unitPrice = unit?.selling_price ?? productRow.price;

    const line = await tx.dunda_tab_items.create({
      data: {
        organization_id: input.organizationId,
        tab_id: tab.id,
        product_id: product.id,
        name: product.name,
        quantity: input.quantity,
        unit_price: unitPrice,
        total: unitPrice * input.quantity,
        category: product.category,
        unit_id: unit?.id ?? null,
        unit_name: unit?.name ?? null,
        notes: input.notes,
      },
    });

    if (unit) {
      await tx.dunda_tab_item_units.create({
        data: {
          tab_item_id: line.id,
          unit_id: unit.id,
          unit_name: unit.name,
          conversion_factor: Number(unit.conversion_factor),
          quantity_in_base_unit: Math.round(
            Number(unit.conversion_factor) * input.quantity * 10000,
          ),
        },
      });
    }

    const totals = await recalculateTab(tx, {
      organizationId: input.organizationId,
      tabId: tab.id,
      discount: tab.discount,
    });

    await tx.dunda_tabs.update({ where: { id: tab.id }, data: totals });

    return tx.dunda_tabs.findUniqueOrThrow({ where: { id: tab.id } });
  }, TRANSACTION_OPTIONS);
}

/** Applies a discount. A big one needs the manager permission, checked by the route. */
export async function applyDiscount(
  organizationId: string,
  tabId: string,
  discount: number,
  staffId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const tab = await tx.dunda_tabs.findFirst({
      where: orgWhere(organizationId, { id: tabId }),
    });
    if (!tab) throw notFound("That tab");
    if (tab.status !== "OPEN") throw wrongState(`Tab ${tab.number} is no longer open.`);

    if (discount > tab.subtotal) {
      throw wrongState("A discount cannot be more than the bill.");
    }

    const totals = await recalculateTab(tx, {
      organizationId,
      tabId,
      discount,
    });

    await tx.dunda_tabs.update({ where: { id: tabId }, data: { discount, ...totals } });

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: tab.branch_id,
        staff_id: staffId,
        action: "UPDATE",
        entity: "tab",
        entity_id: tabId,
        detail: `Discount of ${discount} applied to ${tab.number}`,
        previous_value: { discount: tab.discount },
        new_value: { discount },
      },
    });

    return tx.dunda_tabs.findUniqueOrThrow({ where: { id: tabId } });
  }, TRANSACTION_OPTIONS);
}

/**
 * Closes a tab.
 *
 * The bill has to be settled, or somebody with the authority to leave it on
 * account has to say so. A tab is never simply abandoned: that is how a night's
 * revenue goes missing.
 */
export async function closeTab(
  organizationId: string,
  tabId: string,
  input: { allowOutstanding: boolean; staffId: string | null; reason?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const tab = await tx.dunda_tabs.findFirst({
      where: orgWhere(organizationId, { id: tabId }),
      // pool_total and discount are needed to rebuild the bill: the session's
      // charge lands on top of whatever pool time the tab already carries, and the
      // discount has to be preserved across the recalculation.
      select: {
        id: true,
        status: true,
        number: true,
        table_id: true,
        total: true,
        outstanding: true,
        pool_total: true,
        discount: true,
        branch_id: true,
      },
    });
    if (!tab) throw notFound("That tab");
    if (tab.status !== "OPEN") throw wrongState(`Tab ${tab.number} is already closed.`);

    // A running pool session still owes money, so closing the tab now would lose
    // the pool charge. Ending the session settles it onto the tab first.
    const liveSession = await tx.dunda_pool_sessions.findFirst({
      where: { tab_id: tab.id, status: { in: ["ACTIVE", "PAUSED"] } },
      select: { id: true },
    });
    if (liveSession) {
      throw wrongState(
        "End the pool session first — its time is still being added to this bill.",
      );
    }

    if (tab.outstanding > 0 && !input.allowOutstanding) {
      throw wrongState(
        `Tab ${tab.number} still owes ${tab.outstanding}. Take payment, or close it on account if you are authorised.`,
      );
    }

    const settled = await tx.dunda_tabs.update({
      where: { id: tab.id },
      data: {
        status: tab.outstanding > 0 ? "ON_ACCOUNT" : "CLOSED",
        closed_at: new Date(),
        closed_by_id: input.staffId,
        allowed_on_account: tab.outstanding > 0 ? input.allowOutstanding : false,
      },
    });

    if (tab.table_id) {
      await tx.dunda_tables.update({
        where: { id: tab.table_id },
        data: { status: "AVAILABLE", tab_id: null, customer: null, total: 0 },
      });
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: tab.branch_id,
        staff_id: input.staffId,
        action: "UPDATE",
        entity: "tab",
        entity_id: tab.id,
        detail:
          tab.outstanding > 0
            ? `${tab.number} closed on account with ${tab.outstanding} outstanding`
            : `${tab.number} closed`,
        previous_value: { status: tab.status },
        new_value: { status: settled.status, outstanding: tab.outstanding },
        reason: input.reason ?? null,
      },
    });

    return tx.dunda_tabs.findUniqueOrThrow({ where: { id: tab.id } });
  }, TRANSACTION_OPTIONS);
}

export interface CheckoutPayment {
  method: string;
  amount: number;
  reference?: string | null;
  paidBy?: string | null;
  /** Set when the money arrived through a provider such as Pesapal. */
  provider?: string | null;
}

export interface CheckoutInput {
  organizationId: string;
  tabId: string;
  branchId: string;
  payments: CheckoutPayment[];
  staffId: string | null;
  idempotencyKey?: string | null;
  /**
   * The provider attempt this settlement resolves. Claimed inside the
   * transaction, so a callback that arrives twice settles the tab once.
   */
  attemptId?: string | null;
}

export interface CheckoutResult {
  tab: { id: string; number: string; total: number; outstanding: number; status: string };
  payments: { id: string; method: string; amount: number; reference: string | null }[];
  receipt: { id: string; number: string; total: number; issuedAt: string };
  tabClosed: boolean;
}

/**
 * The stored form of a request's idempotency key.
 *
 * A split bill is one request that writes several payment rows, so each row needs
 * its own key to stay unique while still being recognisable as belonging to that
 * one request. The trailing marker keeps the derived keys from colliding with a
 * different request whose key happens to be a prefix of this one.
 */
function idempotencyPrefix(key: string): string {
  return `${key}#`;
}

/**
 * Takes payment against a tab.
 *
 * The amount each payment covers is checked against what is actually owed, so a
 * split bill across three phones cannot quietly pay twice. Every payment is its own
 * row, because "who paid the M-Pesa half" has to remain answerable after the
 * table has moved on.
 *
 * The idempotency key makes a retried request safe: a till that times out and is
 * pressed again must not take a second payment for the same bill. Each payment in
 * a split is stored under a derived key so two identical-looking payments in one
 * request stay distinct rows, which means the lookup has to match the prefix
 * rather than one exact value.
 */
export async function checkoutTab(input: CheckoutInput): Promise<CheckoutResult> {
  if (input.payments.length === 0) {
    throw wrongState("A payment needs an amount and a method.");
  }

  if (input.idempotencyKey) {
    const existing = await prisma.dunda_payments.findFirst({
      where: {
        organization_id: input.organizationId,
        idempotency_key: { startsWith: idempotencyPrefix(input.idempotencyKey) },
      },
      select: { id: true },
    });
    if (existing) {
      return rebuildResult(input.organizationId, input.tabId, true);
    }
  }

  return applyTabPayment(input);
}

/**
 * The settlement itself, inside one transaction.
 *
 * Exported because a provider callback settles a tab the same way a
 * till does: the money has already been confirmed with the provider,
 * and the only thing left is to write it against the bill.
 */
export async function applyTabPayment(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  return prisma.$transaction(async (tx) => {
    // A callback that arrives twice is a provider retry, not a second
    // payment. The attempt is claimed here, inside the transaction, so
    // the claim and the settlement commit together or not at all.
    if (input.attemptId) {
      const claimed = await tx.dunda_payment_attempts.updateMany({
        where: { id: input.attemptId, status: "INITIATED" },
        data: { status: "RESOLVED", resolved_at: new Date() },
      });
      if (claimed.count === 0) {
        return rebuildResult(input.organizationId, input.tabId, true);
      }
    }

    const tab = await tx.dunda_tabs.findFirst({
      where: orgWhere(input.organizationId, { id: input.tabId }),
      include: { dunda_payments: { select: { amount: true, status: true } } },
    });
    if (!tab) throw notFound("That tab");

    // Only live payments count towards what has been settled. A voided payment
    // puts the money back on the tab.
    const alreadyPaid = tab.dunda_payments
      .filter((p) => p.status !== "VOIDED")
      .reduce((sum, p) => sum + p.amount, 0);
    const outstanding = Math.max(0, tab.total - alreadyPaid);

    const tendered = input.payments.reduce((sum, p) => sum + p.amount, 0);

    // Overpaying is refused rather than silently absorbed. A club that wants to
    // take an overpayment has to say so, because the difference is money the
    // guest is owed back.
    if (tendered > outstanding) {
      throw wrongState(
        `That is more than the ${outstanding} still owed on this tab.`,
      );
    }
    if (tendered <= 0) {
      throw wrongState("A payment has to be for something.");
    }

    const createdPayments = [];
    // A settlement that arrives through a provider callback has no
    // request-side key, so the attempt stands in for one: the payment
    // row stays traceable to the order the provider confirmed.
    const idempotencyKey = input.idempotencyKey ?? input.attemptId ?? null;
    for (const [paymentIndex, payment] of input.payments.entries()) {
      createdPayments.push(
        await tx.dunda_payments.create({
          data: {
            organization_id: input.organizationId,
            branch_id: input.branchId,
            tab_id: tab.id,
            amount: payment.amount,
            method: payment.method,
            provider: payment.provider ?? null,
            reference: payment.reference ?? null,
            status: "SUCCESSFUL",
            cashier_id: input.staffId,
            paid_by: payment.paidBy ?? null,
            idempotency_key: idempotencyKey
              ? `${idempotencyPrefix(idempotencyKey)}${paymentIndex}:${payment.method}:${payment.amount}`
              : null,
          },
        }),
      );
    }

    // The attempt is the record of the provider order, so it points
    // at the payment row that resolved it.
    if (input.attemptId && createdPayments[0]) {
      await tx.dunda_payment_attempts.update({
        where: { id: input.attemptId },
        data: { payment_id: createdPayments[0].id },
      });
    }

    const newPaid = alreadyPaid + tendered;
    const remaining = Math.max(0, tab.total - newPaid);
    const fullyPaid = remaining === 0;

    const updatedTab = await tx.dunda_tabs.update({
      where: { id: tab.id },
      data: {
        amount_paid: newPaid,
        outstanding: remaining,
        status: fullyPaid ? "SETTLED" : tab.status,
      },
    });

    if (fullyPaid) {
      await closeTabWithin(tx, input, tab.id);
    }

    const receipt = await issueReceipt(tx, input, {
      tabId: tab.id,
      number: tab.number,
      total: tab.total,
      outstanding: remaining,
      branchId: tab.branch_id,
      amountPaid: newPaid,
    });

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: input.organizationId,
        branch_id: input.branchId,
        staff_id: input.staffId,
        action: "CREATE",
        entity: "payment",
        entity_id: createdPayments[0]?.id ?? null,
        detail: `${tendered} taken on ${tab.number} across ${input.payments.length} payment(s)`,
        new_value: {
          tab: tab.number,
          tendered,
          remaining,
          methods: input.payments.map((p) => p.method),
        },
      },
    });

    return {
      tab: {
        id: updatedTab.id,
        number: updatedTab.number,
        total: updatedTab.total,
        outstanding: remaining,
        status: updatedTab.status,
      },
      payments: createdPayments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: p.amount,
        reference: p.reference,
      })),
      receipt,
      tabClosed: fullyPaid,
    };
  }, TRANSACTION_OPTIONS);
}

/** Closes the tab once the bill is square, inside the payment's transaction. */
async function closeTabWithin(
  tx: Tx,
  input: CheckoutInput,
  tabId: string,
) {
  const tab = await tx.dunda_tabs.findUniqueOrThrow({
    where: { id: tabId },
    select: { table_id: true, number: true, branch_id: true },
  });

  await tx.dunda_tabs.update({
    where: { id: tabId },
    data: { status: "CLOSED", closed_at: new Date(), closed_by_id: input.staffId },
  });

  if (tab.table_id) {
    // The table goes back on the floor as soon as the bill is settled, which is
    // what lets the next party sit down without anyone tidying the floor by hand.
    await tx.dunda_tables.update({
      where: { id: tab.table_id },
      data: { status: "AVAILABLE", tab_id: null, customer: null, total: 0 },
    });
  }

  await tx.dunda_audit_logs.create({
    data: {
      organization_id: input.organizationId,
      branch_id: input.branchId,
      staff_id: input.staffId,
      action: "UPDATE",
      entity: "tab",
      entity_id: tabId,
      detail: `${tab.number} settled and closed`,
      new_value: { status: "CLOSED" },
    },
  });
}

async function issueReceipt(
  tx: Tx,
  input: CheckoutInput,
  tab: {
    tabId: string;
    number: string;
    total: number;
    outstanding: number;
    branchId: string;
    amountPaid: number;
  },
) {
  const full = await tx.dunda_tabs.findUniqueOrThrow({
    where: { id: tab.tabId },
    include: { dunda_customers: { select: { name: true } } },
  });

  const receiptNumber = await nextDocumentNumber(
    tx,
    input.organizationId,
    tab.branchId,
    "RCT",
  );

  const receipt = await tx.dunda_receipts.create({
    data: {
      organization_id: input.organizationId,
      branch_id: tab.branchId,
      number: receiptNumber,
      tab_id: tab.tabId,
      customer_name: full.customer,
      items_subtotal: full.subtotal,
      pool_charges: full.pool_total,
      discount: full.discount,
      service_charge: full.service_charge,
      tax: full.tax,
      total: tab.total,
      amount_paid: tab.amountPaid,
      outstanding: tab.outstanding,
      issued_by_id: input.staffId,
    },
  });

  return {
    id: receipt.id,
    number: receipt.number,
    total: receipt.total,
    issuedAt: receipt.issued_at.toISOString(),
  };
}

/** Rebuilds the checkout response from what is already recorded. */
export async function rebuildResult(
  organizationId: string,
  tabId: string,
  tabClosed: boolean,
): Promise<CheckoutResult> {
  const tab = await prisma.dunda_tabs.findUniqueOrThrow({
    where: { id: tabId },
    include: {
      dunda_payments: { orderBy: { paid_at: "asc" } },
      dunda_receipts: { orderBy: { issued_at: "asc" }, take: 1 },
    },
  });

  const receipt = tab.dunda_receipts[0];

  return {
    tab: {
      id: tab.id,
      number: tab.number,
      total: tab.total,
      outstanding: tab.outstanding,
      status: tab.status,
    },
    payments: tab.dunda_payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: p.amount,
      reference: p.reference,
    })),
    receipt: receipt
      ? {
          id: receipt.id,
          number: receipt.number,
          total: receipt.total,
          issuedAt: receipt.issued_at.toISOString(),
        }
      : { id: "", number: "", total: tab.total, issuedAt: new Date().toISOString() },
    tabClosed,
  };
}

export interface CreateOrderInput {
  organizationId: string;
  branchId: string;
  tableId: string | null;
  tabId: string | null;
  customerId: string | null;
  staffId: string | null;
  items: { productId: string; quantity: number; unitId: string | null; notes: string | null }[];
  notes: string | null;
  station: string;
}

/**
 * Takes an order and sends it to a preparation station.
 *
 * Stock is drawn when the order is completed, not when it is entered: a guest who
 * changes their mind should not have emptied the shelf, and an order that is
 * never served should not have cost the club anything.
 */
export async function createOrder(input: CreateOrderInput) {
  return prisma.$transaction(async (tx) => {
    const products = await tx.dunda_products.findMany({
      where: orgWhere(input.organizationId, { id: { in: input.items.map((i) => i.productId) } }),
      select: {
        id: true,
        name: true,
        category: true,
        category_id: true,
        price: true,
        active: true,
        dunda_product_units: {
          select: { id: true, name: true, selling_price: true, conversion_factor: true, is_base_unit: true },
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const item of input.items) {
      const product = byId.get(item.productId);
      if (!product) throw notFound("One of the products on this order");
      if (!product.active) throw wrongState(`${product.name} is no longer sold.`);
    }

    const number = await nextDocumentNumber(tx, input.organizationId, input.branchId, "ORD");

    // The order is written first because its items carry a foreign key to it. The
    // subtotal is filled in once the lines are known.
    const order = await tx.dunda_orders.create({
      data: {
        organization_id: input.organizationId,
        branch_id: input.branchId,
        number,
        table_id: input.tableId,
        tab_id: input.tabId,
        customer_id: input.customerId,
        staff_id: input.staffId,
        status: "PENDING",
        notes: input.notes,
        revenue_category: "BAR",
      },
    });

    let subtotal = 0;
    const items = [];
    for (const item of input.items) {
      const product = byId.get(item.productId)!;
      const unit =
        product.dunda_product_units.find((u) => u.id === item.unitId) ??
        product.dunda_product_units.find((u) => u.is_base_unit);
      const unitPrice = unit?.selling_price ?? product.price;
      const total = unitPrice * item.quantity;
      subtotal += total;

      const created = await tx.dunda_order_items.create({
        data: {
          order_id: order.id,
          product_id: product.id,
          unit_id: unit?.id ?? null,
          name: product.name,
          quantity: item.quantity,
          unit_price: unitPrice,
          total,
          notes: item.notes,
          category_id: product.category_id,
        },
      });
      items.push(created);
    }

    await tx.dunda_orders.update({
      where: { id: order.id },
      data: { subtotal },
    });

    const ticket = await tx.dunda_order_tickets.create({
      data: {
        organization_id: input.organizationId,
        branch_id: input.branchId,
        order_id: order.id,
        tab_id: input.tabId,
        station: input.station,
        number: `${number}-${input.station.toUpperCase()}`,
        status: "PENDING",
        notes: input.notes,
      },
    });

    for (const item of items) {
      await tx.dunda_order_ticket_items.create({
        data: {
          organization_id: input.organizationId,
          ticket_id: ticket.id,
          order_item_id: item.id,
          name: item.name,
          quantity: item.quantity,
          notes: item.notes,
        },
      });
    }

    return { order, ticket };
  }, TRANSACTION_OPTIONS);
}

/** Moves an order along its lifecycle, drawing stock when it completes. */
export async function updateOrderStatus(
  organizationId: string,
  orderId: string,
  nextStatus: string,
  staffId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.dunda_orders.findFirst({
      where: orgWhere(organizationId, { id: orderId }),
      include: {
        dunda_order_items: {
          select: { product_id: true, quantity: true, unit_id: true },
        },
      },
    });
    if (!order) throw notFound("That order");

    if (!canTransition(order.status, nextStatus)) {
      throw wrongState(
        `An order that is ${order.status.toLowerCase()} cannot become ${nextStatus.toLowerCase()}.`,
      );
    }

    if (nextStatus === "CANCELLED") {
      // Cancelling after the food was served gives the stock back. Before that,
      // nothing left the shelf, so there is nothing to reverse.
      if (order.status === "SERVED" || order.status === "COMPLETED" || order.status === "PAYMENT_PENDING") {
        await reverseForVoid(tx, {
          organizationId,
          branchId: order.branch_id,
          referenceId: order.id,
          lines: order.dunda_order_items.map((i) => ({
            productId: i.product_id,
            quantity: i.quantity,
            unitId: i.unit_id,
          })),
          staffId,
          reason: `Order ${order.number} cancelled`,
        });
      }
    }

    if (nextStatus === "COMPLETED") {
      await deductForSale(tx, {
        organizationId,
        branchId: order.branch_id,
        referenceId: order.id,
        lines: order.dunda_order_items.map((i) => ({
          productId: i.product_id,
          quantity: i.quantity,
          unitId: i.unit_id,
        })),
        staffId,
      });

      if (order.tab_id) {
        const tab = await tx.dunda_tabs.findUniqueOrThrow({
          where: { id: order.tab_id },
          select: { discount: true },
        });
        const totals = await recalculateTab(tx, {
          organizationId,
          tabId: order.tab_id,
          discount: tab.discount,
        });
        await tx.dunda_tabs.update({ where: { id: order.tab_id }, data: totals });
      }
    }

    await tx.dunda_order_tickets.updateMany({
      where: { order_id: order.id },
      data: { status: nextStatus },
    });

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: order.branch_id,
        staff_id: staffId,
        action: nextStatus === "CANCELLED" ? "VOID" : "UPDATE",
        entity: "order",
        entity_id: order.id,
        detail: `${order.number} moved to ${nextStatus}`,
        previous_value: { status: order.status },
        new_value: { status: nextStatus },
      },
    });

    return tx.dunda_orders.update({
      where: { id: order.id },
      data: { status: nextStatus },
    });
  }, TRANSACTION_OPTIONS);
}
