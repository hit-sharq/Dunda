import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { capturePaymentEvidence } from "@/lib/server/payments-risk";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const openDisputeSchema = z.object({
  paymentId: z.string().min(1, "Which payment is being disputed?"),
  reason: z.string().min(1, "The issuer always gives a reason."),
  reasonDetail: z.string().nullable().optional(),
  providerReference: z.string().nullable().optional(),
});

/**
 * Records a chargeback against a payment. The evidence bundle is captured
 * straight away, while the order and the staff member who served it are still
 * on the record. After the card issuer's deadline, that evidence is gone.
 */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

  const session = await requirePermission("manage_disputes");
  const organizationId = session.organizationId as string;

  const input = await parseBody(openDisputeSchema, request);

  const payment = await prisma.dunda_payments.findFirst({
    where: orgWhere(organizationId, { id: input.paymentId }),
    select: {
      id: true,
      amount: true,
      currency: true,
      branch_id: true,
      status: true,
      tab_id: true,
      order_id: true,
      evidence: true,
    },
  });
  if (!payment) throw notFound("That payment");

  if (payment.status === "VOIDED" || payment.status === "REFUNDED") {
    throw wrongState("That payment has already been returned.");
  }

  const existing = await prisma.dunda_payment_disputes.findFirst({
    where: { payment_id: payment.id, status: { in: ["OPEN", "UNDER_REVIEW"] } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: "That payment already has an open dispute.",
        code: "DUPLICATE_DISPUTE",
        disputeId: existing.id,
      },
      { status: 409 },
    );
  }

  // Capture the evidence now, before anything is cleaned up.
  const evidence =
    (payment.evidence as unknown as Record<string, unknown> | null) ??
    (await capturePaymentEvidence(organizationId, {
      orderId: payment.order_id,
      tabId: payment.tab_id,
      staffId: session.staffId,
      receiptId: null,
    }));

  const dispute = await prisma.dunda_payment_disputes.create({
    data: {
      organization_id: organizationId,
      branch_id: payment.branch_id,
      payment_id: payment.id,
      reason: input.reason,
      reason_detail: input.reasonDetail ?? null,
      amount: payment.amount,
      currency: payment.currency,
      status: "OPEN",
      provider_reference: input.providerReference ?? null,
      evidence: evidence ? (evidence as any) : undefined,
      // Card issuers give a deadline to respond. Most sit between 10 and 30
      // days; we use 21 as the working default.
      due_at: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
    },
    select: {
      id: true,
      payment_id: true,
      reason: true,
      amount: true,
      currency: true,
      status: true,
      opened_at: true,
      due_at: true,
    },
  });

  await prisma.dunda_payments.update({
    where: { id: payment.id },
    data: { dispute_status: "OPEN" },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: payment.branch_id,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "payment_dispute",
      entity_id: dispute.id,
      detail: `Chargeback opened on ${payment.id}: ${input.reason}`,
      new_value: { reason: input.reason, amount: payment.amount },
    },
  });

  return NextResponse.json(dispute, { status: 201 });
});

/** Every open and historical dispute for this club. */
export const GET = route(async (request: Request) => {
  const session = await requirePermission("manage_disputes");
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const disputes = await prisma.dunda_payment_disputes.findMany({
    where: orgWhere(organizationId, status ? { status } : {}),
    orderBy: { opened_at: "desc" },
    take: 200,
    include: {
      dunda_payments: {
        select: {
          id: true,
          card_last4: true,
          card_brand: true,
          method: true,
          amount: true,
          paid_at: true,
          risk_score: true,
          risk_flags: true,
        },
      },
      dunda_staff: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(
    disputes.map((d) => ({
      id: d.id,
      paymentId: d.payment_id,
      reason: d.reason,
      reasonDetail: d.reason_detail,
      amount: d.amount,
      currency: d.currency,
      status: d.status,
      liability: d.liability,
      providerReference: d.provider_reference,
      notes: d.notes,
      openedAt: d.opened_at.toISOString(),
      dueAt: d.due_at?.toISOString() ?? null,
      respondedAt: d.responded_at?.toISOString() ?? null,
      resolvedAt: d.resolved_at?.toISOString() ?? null,
      hasEvidence: Boolean(d.evidence),
      respondedBy: d.dunda_staff
        ? { id: d.dunda_staff.id, name: d.dunda_staff.name }
        : null,
      payment: {
        id: d.dunda_payments.id,
        cardLast4: d.dunda_payments.card_last4,
        cardBrand: d.dunda_payments.card_brand,
        method: d.dunda_payments.method,
        amount: d.dunda_payments.amount,
        paidAt: d.dunda_payments.paid_at.toISOString(),
        riskScore: d.dunda_payments.risk_score,
        riskFlags: d.dunda_payments.risk_flags,
      },
    })),
  );
});
