import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { refundClubPayment } from "@/lib/server/payments";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const refundInputSchema = z.object({
  paymentId: z.string().min(1, "Which payment are you refunding?"),
  amount: z.number().int().positive("A refund has to be more than nothing."),
  reason: z.string().min(1, "A refund needs a reason for the audit trail."),
  status: z.enum(["PENDING", "APPROVED"]).optional(),
});

/** Every refund raised by this club, newest first. */
export const GET = route(async (request: Request) => {
  const session = await requirePermission("refund_payment");
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const refunds = await prisma.dunda_refunds.findMany({
    where: orgWhere(organizationId, status ? { status } : {}),
    orderBy: { created_at: "desc" },
    take: 200,
    include: {
      dunda_staff: { select: { id: true, name: true } },
      dunda_payments: {
        select: {
          id: true,
          method: true,
          amount: true,
          currency: true,
          card_last4: true,
          card_brand: true,
          status: true,
          dispute_status: true,
        },
      },
    },
  });

  return NextResponse.json(
    refunds.map((r) => ({
      id: r.id,
      paymentId: r.payment_id,
      amount: r.amount,
      reason: r.reason,
      status: r.status,
      approvedById: r.approved_by_id,
      approvedBy: r.dunda_staff
        ? { id: r.dunda_staff.id, name: r.dunda_staff.name }
        : null,
      createdAt: r.created_at.toISOString(),
      payment: {
        id: r.dunda_payments.id,
        method: r.dunda_payments.method,
        amount: r.dunda_payments.amount,
        currency: r.dunda_payments.currency,
        cardLast4: r.dunda_payments.card_last4,
        cardBrand: r.dunda_payments.card_brand,
        status: r.dunda_payments.status,
        disputeStatus: r.dunda_payments.dispute_status,
      },
    })),
  );
});

/**
 * Raises a refund. A refund over the limit is held as PENDING for a manager
 * to release; anything smaller goes straight back to the card.
 */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

  const session = await requirePermission("refund_payment");
  const organizationId = session.organizationId as string;

  const input = await parseBody(refundInputSchema, request);

  const staff = session.staffId
    ? await prisma.dunda_staff.findUnique({
        where: { id: session.staffId },
        select: { name: true },
      })
    : null;

  const refund = await refundClubPayment({
    organizationId,
    paymentId: input.paymentId,
    amount: input.amount,
    reason: input.reason,
    staffId: session.staffId,
    staffName: staff?.name ?? "Dunda console",
    requiresApproval: session.permissions.has("approve_refunds"),
  });

  return NextResponse.json(
    {
      id: refund.id,
      paymentId: input.paymentId,
      amount: refund.amount,
      reason: input.reason,
      status: refund.status,
      approvedById: session.staffId,
      createdAt: new Date().toISOString(),
      awaitingApproval: refund.status === "PENDING",
    },
    { status: 201 },
  );
});
