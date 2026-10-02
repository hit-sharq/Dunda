import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requirePermission, orgWhere, assertSameOrg } from "@/lib/server/http";
import { ApiError, moneyRule } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/**
 * Club customer payments: every payment taken at the till.
 *
 * Kept entirely separate from Dunda's own subscription billing, which lives in
 * dunda_billing_payments. A club paying for software and a guest paying for
 * drinks are different obligations and must never be summed together.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const payments = await prisma.dunda_payments.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      ...(from || to
        ? {
            paid_at: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    }),
    orderBy: { paid_at: "desc" },
    take: 300,
    include: {
      dunda_tabs: { select: { id: true, number: true } },
      dunda_staff: { select: { name: true } },
    },
  });

  const totals = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status === "VOIDED") continue;
    totals.set(payment.method, (totals.get(payment.method) ?? 0) + payment.amount);
  }

  return NextResponse.json({
    payments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      status: p.status,
      tabNumber: p.dunda_tabs?.number ?? null,
      staffName: p.dunda_staff?.name ?? null,
      paidAt: p.paid_at.toISOString(),
    })),
    byMethod: [...totals.entries()].map(([label, value]) => ({ label, value })),
    collected: [...totals.values()].reduce((sum, value) => sum + value, 0),
  });
});

/**
 * Refunds a payment, by writing the reversal rather than deleting the original.
 *
 * The original payment stays exactly as it was taken, so the till's takings for
 * the night still reconcile. The refund needs a manager, and it cannot exceed the
 * payment it is reversing.
 */
export const POST = route(async (request: Request) => {
  const session = await requirePermission("refund_payment");
  const organizationId = session.organizationId as string;

  const body = (await request.json().catch(() => ({}))) as {
    paymentId?: string;
    amount?: number;
    reason?: string;
  };

  if (!body.paymentId || !body.amount || body.amount <= 0) {
    return NextResponse.json(
      { error: "Say which payment and how much to refund.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }
  if (!body.reason?.trim()) {
    return NextResponse.json(
      { error: "A refund needs a reason for the audit trail.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const payment = await prisma.dunda_payments.findFirst({
    where: orgWhere(organizationId, { id: body.paymentId }),
    include: { dunda_refunds: { select: { amount: true, status: true } } },
  });
  assertSameOrg(payment, organizationId, "That payment");

  if (payment.status === "VOIDED") {
    throw moneyRule("That payment has already been voided.");
  }

  const alreadyRefunded = payment.dunda_refunds
    .filter((r) => r.status !== "REJECTED")
    .reduce((sum, r) => sum + r.amount, 0);
  const refundable = payment.amount - alreadyRefunded;

  if (body.amount > refundable) {
    throw moneyRule(`Only ${refundable} of that payment can still be refunded.`);
  }

  const refund = await prisma.$transaction(async (tx) => {
    const created = await tx.dunda_refunds.create({
      data: {
        organization_id: organizationId,
        branch_id: payment.branch_id,
        payment_id: payment.id,
        amount: body.amount as number,
        reason: body.reason as string,
        status: "APPROVED",
        approved_by_id: session.staffId,
      },
    });

    // A full refund voids the payment; a partial one leaves it standing so the
    // receipt still shows what was taken.
    if (body.amount === payment.amount) {
      await tx.dunda_payments.update({
        where: { id: payment.id },
        data: { status: "REFUNDED", voided_at: new Date(), voided_by_id: session.staffId },
      });
    }

    // Money goes back onto the tab so it can be re-settled rather than becoming a
    // credit nobody can see.
    if (payment.tab_id) {
      const tab = await tx.dunda_tabs.findUniqueOrThrow({
        where: { id: payment.tab_id },
        select: { amount_paid: true, outstanding: true },
      });
      await tx.dunda_tabs.update({
        where: { id: payment.tab_id },
        data: {
          amount_paid: Math.max(0, tab.amount_paid - (body.amount as number)),
          outstanding: Math.max(0, tab.outstanding + (body.amount as number)),
        },
      });
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: payment.branch_id,
        staff_id: session.staffId,
        action: "REFUND",
        entity: "payment",
        entity_id: payment.id,
        detail: `${body.amount} refunded`,
        reason: body.reason as string,
        previous_value: { status: payment.status },
        new_value: { refundId: created.id, amount: body.amount },
      },
    });

    return created;
  });

  return NextResponse.json(
    { id: refund.id, amount: refund.amount, status: refund.status },
    { status: 201 },
  );
});
