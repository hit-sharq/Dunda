import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission } from "@/lib/server/http";
import { summariseChargebacks } from "@/lib/server/payments-risk";

export const dynamic = "force-dynamic";

/**
 * The numbers a club owner needs to see: what fraction of payments get
 * charged back, what it is costing, and which payments were flagged before
 * the money moved.
 */
export const GET = route(async (request: Request) => {
  const session = await requirePermission("view_reports");
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days") ?? 90)));

  const summary = await summariseChargebacks(organizationId, days);

  const [flagged, recentDisputes, topRiskyCards, refundsHeld] = await Promise.all([
    prisma.dunda_payments.count({
      where: {
        organization_id: organizationId,
        risk_action: "REVIEW",
        paid_at: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.dunda_payment_disputes.findMany({
      where: {
        organization_id: organizationId,
        opened_at: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      },
      orderBy: { opened_at: "desc" },
      take: 10,
      select: {
        id: true,
        reason: true,
        amount: true,
        status: true,
        opened_at: true,
        due_at: true,
      },
    }),
    prisma.dunda_payments.groupBy({
      by: ["card_last4", "card_brand"],
      where: {
        organization_id: organizationId,
        card_last4: { not: null },
        paid_at: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      },
      _sum: { amount: true },
      _count: true,
      _max: { risk_score: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    prisma.dunda_refunds.count({
      where: {
        organization_id: organizationId,
        status: "PENDING",
      },
    }),
  ]);

  return NextResponse.json({
    summary: {
      ...summary,
      chargebackRatePercent: Number((summary.chargebackRate * 100).toFixed(2)),
      flaggedForReview: flagged,
      refundsAwaitingApproval: refundsHeld,
    },
    recentDisputes: recentDisputes.map((d) => ({
      id: d.id,
      reason: d.reason,
      amount: d.amount,
      status: d.status,
      openedAt: d.opened_at.toISOString(),
      dueAt: d.due_at?.toISOString() ?? null,
      overdue:
        d.due_at !== null && d.due_at < new Date() && d.status === "OPEN",
    })),
    topRiskyCards: topRiskyCards.map((c) => ({
      cardLast4: c.card_last4,
      cardBrand: c.card_brand,
      payments: c._count,
      total: c._sum.amount ?? 0,
      highestRiskScore: c._max.risk_score ?? 0,
    })),
  });
});
