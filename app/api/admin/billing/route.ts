import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";
import {
  getOpenBillingPayment,
  initiateBillingPayment,
  runRenewalSweep,
} from "@/lib/server/payments";

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

/**
 * Collects what a club owes, through Pesapal.
 *
 * The operator sends the club the link that comes back;
 * the club's owner pays it, and the callback completes
 * the billing payment and renews the subscription. The
 * amount is the subscription's own, so the console
 * cannot ask a club for a different figure than the
 * one it agreed to.
 */
export const POST = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const body = (await request.json().catch(() => ({}))) as {
    organizationId?: string;
    subscriptionId?: string;
    kind?: string;
    /** Offer the club an automatic renewal mandate. */
    autoRenew?: boolean;
    /** Start a payment for every renewal coming due. */
    sweep?: boolean;
  };

  // The sweep is the same work the schedule
  // does, offered to the console so a
  // renewal can be chased without waiting
  // for the next run.
  if (body.sweep) {
    const result = await runRenewalSweep();
    return NextResponse.json(result);
  }

  if (!body.organizationId) {
    return NextResponse.json(
      { error: "Say which club is paying.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  // The club's newest subscription is the one that
  // renews; an explicit id collects against a specific
  // one instead.
  const subscription = body.subscriptionId
    ? await prisma.dunda_subscriptions.findFirst({
        where: {
          id: body.subscriptionId,
          organization_id: body.organizationId,
        },
      })
    : await prisma.dunda_subscriptions.findFirst({
        where: { organization_id: body.organizationId },
        orderBy: { created_at: "desc" },
      });

  if (!subscription) {
    return NextResponse.json(
      { error: "That club has no subscription to pay.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  let initiation;
  try {
    initiation = await initiateBillingPayment({
      organizationId: body.organizationId,
      subscriptionId: subscription.id,
      kind: body.kind,
      // Collecting is offered as an automatic
      // renewal by default: that is the point
      // of a subscription.
      autoRenew: body.autoRenew ?? true,
    });
  } catch (error) {
    // A payment already open is the answer to
    // "collect", not an error: the club's own
    // screen shows it, and a second order would
    // ask for the same money twice.
    const open = await getOpenBillingPayment(body.organizationId);
    if (open) {
      return NextResponse.json({
        billingPaymentId: open.billingPaymentId,
        orderTrackingId: open.orderTrackingId,
        redirectUrl: open.redirectUrl,
        amount: open.amount,
        currency: open.currency,
      });
    }
    throw error;
  }

  return NextResponse.json(initiation, { status: 201 });
});
