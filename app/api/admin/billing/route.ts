import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Dunda's own billing: what clubs pay for the software.
 *
 * This is a different obligation from a club's customer payments, which live in
 * dunda_payments. A club paying Dunda and a guest paying for drinks never appear
 * in the same total, and neither figure is derived from the other.
 */
export const GET = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const [payments, invoices, organizations, plans] = await Promise.all([
    prisma.dunda_billing_payments.findMany({
      where: status ? { status } : undefined,
      orderBy: { created_at: "desc" },
      take: 200,
      select: {
        id: true,
        organization_id: true,
        subscription_id: true,
        kind: true,
        status: true,
        amount: true,
        currency: true,
        provider: true,
        provider_reference: true,
        provider_transaction_id: true,
        paid_at: true,
        refunded_amount: true,
        failure_reason: true,
        created_at: true,
      },
    }),
    prisma.dunda_invoices.findMany({
      orderBy: { issued_at: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        organization_id: true,
        status: true,
        amount: true,
        currency: true,
        period_start: true,
        period_end: true,
        issued_at: true,
      },
    }),
    prisma.dunda_organizations.findMany({
      select: { id: true, name: true },
    }),
    prisma.dunda_plans.findMany({
      select: { id: true, name: true, code: true, monthly_price: true },
    }),
  ]);

  const orgById = new Map(organizations.map((o) => [o.id, o.name]));
  const planById = new Map(plans.map((p) => [p.id, p]));

  const totals = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== "COMPLETED") continue;
    totals.set(payment.currency, (totals.get(payment.currency) ?? 0) + payment.amount);
  }

  const subscriptions = await prisma.dunda_subscriptions.findMany({
    select: { id: true, organization_id: true, plan_id: true, amount: true, currency: true },
  });
  const planBySub = new Map(subscriptions.map((s) => [s.id, s]));

  const revenueByPlan = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== "COMPLETED") continue;
    const sub = planBySub.get(payment.subscription_id);
    const planName = sub?.plan_id ? planById.get(sub.plan_id)?.name : undefined;
    const key = planName ?? "Unassigned";
    revenueByPlan.set(key, (revenueByPlan.get(key) ?? 0) + payment.amount);
  }

  return NextResponse.json({
    // Money actually received. Not MRR, and not the clubs' own takings — this is
    // what Dunda has been paid.
    collected: [...totals.values()].reduce((sum, value) => sum + value, 0),
    payments: payments.map((p) => ({
      id: p.id,
      organizationId: p.organization_id,
      organization: orgById.get(p.organization_id) ?? "Unknown",
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      provider: p.provider,
      paidAt: p.paid_at?.toISOString() ?? null,
      createdAt: p.created_at.toISOString(),
    })),
    // Only the payments that did not go through, kept separate so the console can
    // chase them without the operator having to pick them out of the full list.
    failed: payments
      .filter((p) => p.status === "FAILED")
      .map((p) => ({
        id: p.id,
        organization: orgById.get(p.organization_id) ?? "Unknown",
        amount: p.amount,
        reason: p.failure_reason,
        createdAt: p.created_at.toISOString(),
      })),
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      organizationId: i.organization_id,
      organization: orgById.get(i.organization_id) ?? "Unknown",
      status: i.status,
      amount: i.amount,
      currency: i.currency,
      periodStart: i.period_start?.toISOString() ?? null,
      periodEnd: i.period_end?.toISOString() ?? null,
      issuedAt: i.issued_at.toISOString(),
    })),
    revenueByCurrency: [...totals.entries()].map(([label, value]) => ({ label, value })),
    revenueByPlan: [...revenueByPlan.entries()].map(([label, value]) => ({ label, value })),
  });
});
