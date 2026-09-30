import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  activityTable,
  auditLogsTable,
  ordersTable,
  paymentsTable,
  refundsTable,
  reservationsTable,
  tablesTable,
  eventReservationsTable,
  customersTable,
  eventsTable,
  notificationsTable,
  staffTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import type { StaffContext } from "../lib/permissions";

const router: IRouter = Router();

function can(req: any, permission: string): boolean {
  const ctx: StaffContext | undefined = req.clerk?.__staffContext;
  if (!ctx) return false;
  return ctx.isOwner || ctx.permissions.has(permission);
}

function deny(res: any, permission: string): void {
  res.status(403).json({
    error: `You do not have permission to perform this action. Required: ${permission}`,
  });
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function audit(params: {
  organizationId: string;
  branchId: string | null;
  staffId: string | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "REFUND" | "APPROVE" | "VOID" | "ADJUST";
  entity: string;
  entityId?: string | null;
  detail?: string | null;
  reason?: string | null;
}): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: uid("audit"),
    organizationId: params.organizationId,
    branchId: params.branchId,
    staffId: params.staffId,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    detail: params.detail,
    reason: params.reason,
  });
}

const METHODS = ["CASH", "MPESA", "CARD", "BANK_TRANSFER", "OTHER"] as const;

const CreatePaymentBody = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
  method: z.enum(METHODS),
  reference: z.string().nullable().optional(),
  // Split payments: the order is only paid once the full total is covered.
  isFinal: z.boolean().default(true),
});

// --- Payments ---------------------------------------------------------------

router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const orderId = req.query.orderId ? String(req.query.orderId) : null;
  const filters = [eq(paymentsTable.organizationId, tenant.organizationId)];
  if (orderId) filters.push(eq(paymentsTable.orderId, orderId));

  const rows = await db
    .select()
    .from(paymentsTable)
    .where(and(...filters))
    .orderBy(desc(paymentsTable.paidAt));
  res.json(rows);
});

router.post("/", async (req, res): Promise<void> => {
  if (!can(req, "manage_payments")) return deny(res, "manage_payments");
  const tenant = getTenant(req);
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, data.orderId),
        eq(ordersTable.organizationId, tenant.organizationId),
      ),
    );
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const existingPayments = await tx
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.orderId, order.id),
          eq(paymentsTable.status, "SUCCESSFUL"),
        ),
      );
    const alreadyPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = order.total - alreadyPaid;

    if (data.amount > outstanding) {
      throw new Error("Payment exceeds the outstanding balance");
    }

    const [payment] = await tx
      .insert(paymentsTable)
      .values({
        id: uid("pay"),
        organizationId: order.organizationId,
        branchId: order.branchId,
        orderId: order.id,
        amount: data.amount,
        method: data.method,
        reference: data.reference ?? null,
        status: "SUCCESSFUL",
        cashierId: tenant.staffId,
        paidAt: new Date(),
      })
      .returning();

    const totalPaid = alreadyPaid + data.amount;
    const fullyPaid = totalPaid >= order.total;

    if (fullyPaid && data.isFinal && order.status !== "COMPLETED") {
      await tx
        .update(ordersTable)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(ordersTable.id, order.id));
      await tx
        .update(tablesTable)
        .set({ status: "AVAILABLE", tabId: null, customer: null, total: 0 })
        .where(and(eq(tablesTable.tabId, order.id)));
    }

    await tx.insert(activityTable).values({
      id: uid("act"),
      organizationId: order.organizationId,
      branchId: order.branchId,
      type: "PAYMENT",
      title: "Payment received",
      detail: `${order.number} · ${data.method}`,
      amount: data.amount,
    });

    return { payment, totalPaid, outstanding: order.total - totalPaid, fullyPaid };
  }).catch((err: Error) => {
    res.status(400).json({ error: err.message });
    return null;
  });

  if (!result) return;

  await audit({
    organizationId: tenant.organizationId,
    branchId: tenant.branchId,
    staffId: tenant.staffId,
    action: "CREATE",
    entity: "PAYMENT",
    entityId: result.payment.id,
    detail: `KES ${data.amount} by ${data.method} on ${order.number}`,
  });

  res.status(201).json({
    ...result.payment,
    outstanding: result.outstanding,
    fullyPaid: result.fullyPaid,
  });
});

// --- Refunds ----------------------------------------------------------------

router.post("/refunds", async (req, res): Promise<void> => {
  if (!can(req, "refund_payment")) return deny(res, "refund_payment");
  const tenant = getTenant(req);
  const parsed = z
    .object({
      paymentId: z.string().min(1),
      amount: z.number().int().positive(),
      reason: z.string().min(1, "A reason is required for every refund"),
      status: z.enum(["PENDING", "SUCCESSFUL"]).default("SUCCESSFUL"),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.id, data.paymentId),
        eq(paymentsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  const existingRefunds = await db
    .select()
    .from(refundsTable)
    .where(and(eq(refundsTable.paymentId, payment.id), eq(refundsTable.status, "SUCCESSFUL")));
  const alreadyRefunded = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
  if (data.amount > payment.amount - alreadyRefunded) {
    res.status(400).json({ error: "Refund exceeds the remaining refundable amount" });
    return;
  }

  const [refund] = await db.transaction(async (tx) => {
    const row = await tx
      .insert(refundsTable)
      .values({
        id: uid("ref"),
        organizationId: payment.organizationId,
        branchId: payment.branchId,
        paymentId: payment.id,
        amount: data.amount,
        reason: data.reason,
        status: data.status,
        approvedById: tenant.staffId,
      })
      .returning();

    if (data.status === "SUCCESSFUL") {
      const total = alreadyRefunded + data.amount;
      await tx
        .update(paymentsTable)
        .set({
          status: total >= payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED",
        })
        .where(eq(paymentsTable.id, payment.id));
    }
    return row;
  });

  await audit({
    organizationId: tenant.organizationId,
    branchId: tenant.branchId,
    staffId: tenant.staffId,
    action: "REFUND",
    entity: "PAYMENT",
    entityId: payment.id,
    detail: `Refund KES ${data.amount} (${data.status})`,
    reason: data.reason,
  });

  res.status(201).json(refund);
});

router.get("/refunds", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(refundsTable)
    .where(eq(refundsTable.organizationId, tenant.organizationId))
    .orderBy(desc(refundsTable.createdAt));
  res.json(rows);
});

export default router;
