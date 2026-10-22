import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

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
