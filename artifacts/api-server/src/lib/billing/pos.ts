import { and, eq, inArray, sql } from "drizzle-orm";
import { db, ordersTable, paymentsTable, type Order } from "@workspace/db";
import { z } from "zod";

/**
 * Payments a customer makes to a club at the till.
 *
 * This is the club's money, not Dunda's, and it has nothing to share with
 * subscription billing beyond the provider interface. A tab is settled by one
 * payment, by several, by several methods, or by several named customers, and the
 * bill is only closed when it is fully covered.
 */

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export const POS_METHODS = ["CASH", "MPESA", "CARD", "BANK", "OTHER"] as const;
export type PosMethod = (typeof POS_METHODS)[number];

const ShareSchema = z.object({
  method: z.enum(POS_METHODS),
  amount: z.number().int().positive("A payment must be more than nothing."),
  /** Who settled this share. Optional for a single-payer bill. */
  paidBy: z.string().max(120).nullable().optional(),
  /** The till or paybill reference for an electronic payment. */
  reference: z.string().max(120).nullable().optional(),
});

export const RecordShareSchema = z.object({
  shares: z.array(ShareSchema).min(1, "A payment needs at least one share."),
  /** Settles the order when the last share brings it to zero. */
  settle: z.boolean().default(true),
});

export type RecordShare = z.infer<typeof ShareSchema>;

/**
 * What is still owed on an order.
 *
 * Derived from the order and its payments rather than stored, so it can never
 * drift from the rows that caused it.
 */
export async function outstandingFor(orderId: string): Promise<{
  total: number;
  paid: number;
  outstanding: number;
}> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  if (!order) throw new PaymentError("No such order.", 404, "ORDER_NOT_FOUND");

  const [paidRow] = await db
    .select({ paid: sql<number>`coalesce(sum(amount), 0)`.mapWith(Number) })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.orderId, orderId),
        inArray(paymentsTable.status, ["SUCCESSFUL", "PARTIAL", "PARTIALLY_REFUNDED"]),
      ),
    );
  const paid = paidRow?.paid ?? 0;
  return { total: order.total, paid, outstanding: order.total - paid };
}

export interface RecordResult {
  order: Order;
  payments: { id: string; amount: number; method: string; paidBy: string | null }[];
  settled: boolean;
  total: number;
  paid: number;
  outstanding: number;
}

/**
 * Records one or more shares against an order.
 *
 * The whole set is written together, and the order is only settled when the
 * shares cover what was owed. Overpayment is refused: refunding an overpayment is
 * an authorised decision, not something a till should be able to do by accident.
 */
export async function recordPayment(
  input: { orderId: string; shares: RecordShare[]; settle?: boolean },
  cashier: { staffId: string | null; organizationId: string; branchId: string | null },
): Promise<RecordResult> {
  const shares = z.array(ShareSchema).min(1).parse(input.shares);

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, input.orderId),
        eq(ordersTable.organizationId, cashier.organizationId),
      ),
    );
  // Scoped to the caller's organization, so one club can never settle another's
  // bill.
  if (!order) throw new PaymentError("No such order.", 404, "ORDER_NOT_FOUND");
  if (["CANCELLED"].includes(order.status)) {
    throw new PaymentError("This order was cancelled.", 409, "ORDER_CANCELLED");
  }

  const { paid, outstanding } = await outstandingFor(input.orderId);
  const total = shares.reduce((sum, s) => sum + s.amount, 0);

  if (total > outstanding) {
    throw new PaymentError(
      outstanding === 0
        ? "This order is already fully paid."
        : `That is ${total - outstanding} more than the ${outstanding} still owed. A refund or an authorised overpayment is needed to settle more than the bill.`,
      409,
      outstanding === 0 ? "ALREADY_PAID" : "OVERPAYMENT_NOT_ALLOWED",
    );
  }

  const now = new Date();
  const settle = input.settle !== false && total === outstanding;

  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(paymentsTable)
      .values(
        shares.map((share) => ({
          id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          organizationId: order.organizationId,
          branchId: order.branchId,
          orderId: order.id,
          amount: share.amount,
          method: share.method,
          reference: share.reference ?? null,
          paidBy: share.paidBy ?? null,
          // A partial share is recorded as such, so a report can tell the
          // difference between a settled order and a deposit against one.
          status: total === outstanding ? "SUCCESSFUL" : "PARTIAL",
          cashierId: cashier.staffId,
          paidAt: now,
        })),
      )
      .returning();

    if (settle) {
      await tx
        .update(ordersTable)
        .set({ status: "COMPLETED", updatedAt: now })
        .where(eq(ordersTable.id, order.id));
    }

    return rows;
  });

  return {
    order: settle
      ? ({ ...order, status: "COMPLETED" } as Order)
      : order,
    payments: result.map((r) => ({
      id: r.id,
      amount: r.amount,
      method: r.method,
      paidBy: r.paidBy,
    })),
    settled: settle,
    total: order.total,
    paid: paid + total,
    outstanding: outstanding - total,
  };
}

/**
 * Who has paid what on this order, which is what a club asks when a table wants
 * to settle separately.
 */
export async function splitSummary(orderId: string): Promise<
  { paidBy: string | null; method: string; amount: number }[]
> {
  const rows = await db
    .select({
      paidBy: paymentsTable.paidBy,
      method: paymentsTable.method,
      amount: paymentsTable.amount,
    })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.orderId, orderId),
        inArray(paymentsTable.status, ["SUCCESSFUL", "PARTIAL", "PARTIALLY_REFUNDED"]),
      ),
    );
  return rows;
}