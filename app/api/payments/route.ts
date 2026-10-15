import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requirePermission, orgWhere } from "@/lib/server/http";
import { refundClubPayment } from "@/lib/server/payments";

export const dynamic = "force-dynamic";


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

  const staff = session.staffId
    ? await prisma.dunda_staff.findUnique({
        where: { id: session.staffId },
        select: { name: true },
      })
    : null;

  const refund = await refundClubPayment({
    organizationId,
    paymentId: body.paymentId,
    amount: body.amount,
    reason: body.reason,
    staffId: session.staffId,
    staffName: staff?.name ?? "Dunda console",
  });

  return NextResponse.json(
    { id: refund.id, amount: refund.amount, status: refund.status },
    { status: 201 },
  );
});