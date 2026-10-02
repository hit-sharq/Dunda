import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Every subscription on the platform and what state it is in. */
export const GET = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const subscriptions = await prisma.dunda_subscriptions.findMany({
    where: status ? { status } : undefined,
    orderBy: { created_at: "desc" },
    take: 200,
  });

  const [organizations, plans] = await Promise.all([
    prisma.dunda_organizations.findMany({ select: { id: true, name: true } }),
    prisma.dunda_plans.findMany({
      select: { id: true, name: true, code: true, monthly_price: true, annual_price: true },
    }),
  ]);

  const orgById = new Map(organizations.map((o) => [o.id, o.name]));
  const planById = new Map(plans.map((p) => [p.id, p]));
  const now = Date.now();
  // A renewal inside this window is worth chasing before it lapses. Thirty days is
  // long enough to act on and short enough that "due soon" means something.
  const renewalHorizon = now + 30 * 86400000;

  const rows = subscriptions.map((sub) => {
    const plan = sub.plan_id ? planById.get(sub.plan_id) : null;
    const renewsAt = sub.renews_at ? new Date(sub.renews_at) : null;
    const renewalDue =
      renewsAt !== null && renewsAt.getTime() > now && renewsAt.getTime() <= renewalHorizon;
    return {
      id: sub.id,
      organizationId: sub.organization_id,
      organization: orgById.get(sub.organization_id) ?? "Unknown",
      plan: plan?.name ?? sub.plan,
      planCode: plan?.code ?? sub.plan,
      status: sub.status,
      billingCycle: sub.billing_cycle,
      amount: sub.amount,
      currency: sub.currency,
      branchLimit: sub.branch_limit,
      branchUsage: sub.current_branches,
      userLimit: sub.user_limit,
      userUsage: sub.current_users,
      startedAt: sub.started_at?.toISOString() ?? null,
      trialEndsAt: sub.trial_ends_at?.toISOString() ?? null,
      trialDaysLeft:
        sub.trial_ends_at && sub.status === "TRIAL"
          ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - now) / 86400000))
          : null,
      renewsAt: renewsAt?.toISOString() ?? null,
      renewalDue,
      cancelledAt: sub.cancelled_at?.toISOString() ?? null,
      failedPaymentCount: sub.failed_payment_count,
      createdAt: sub.created_at.toISOString(),
    };
  });

  // Counts and lists rather than one flat array: the console shows "how many are
  // past due" beside "which ones", and computing the first from the second here
  // keeps them from disagreeing.
  const count = (value: string) => rows.filter((r) => r.status === value).length;

  return NextResponse.json({
    counts: {
      total: rows.length,
      active: count("ACTIVE"),
      trial: count("TRIAL"),
      pastDue: count("PAST_DUE"),
      suspended: count("SUSPENDED"),
      cancelled: count("CANCELLED"),
      expired: count("EXPIRED"),
    },
    renewalsDue: rows.filter((r) => r.renewalDue),
    subscriptions: rows,
  });
});

/**
 * Changes what a club pays.
 *
 * A plan change that lowers the price cannot shorten a period the club has already
 * paid for, so it takes effect at the current period's end rather than immediately.
 * Recording that as the new renewal date is what stops an upgrade silently costing
 * the club a refund.
 */
export const PATCH = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const body = (await request.json().catch(() => ({}))) as {
    subscriptionId?: string;
    planId?: string;
    status?: string;
    extendTrialDays?: number;
  };

  if (!body.subscriptionId) {
    return NextResponse.json(
      { error: "Which subscription?", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const existing = await prisma.dunda_subscriptions.findUnique({
    where: { id: body.subscriptionId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "That subscription no longer exists.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const data: Record<string, unknown> = {};
  let detail = "";

  if (body.planId) {
    const plan = await prisma.dunda_plans.findUnique({ where: { id: body.planId } });
    if (!plan) {
      return NextResponse.json(
        { error: "That plan no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    const isDowngrade = plan.monthly_price < (existing.amount || 0);
    data.plan_id = plan.id;
    data.plan = plan.code;
    data.amount = plan.monthly_price;
    data.branch_limit = plan.branch_limit;
    data.user_limit = plan.user_limit;
    if (isDowngrade && existing.renews_at) {
      // Take effect at the end of the period already paid for.
      data.renews_at = existing.renews_at;
    }
    detail = `Moved to ${plan.name}`;
  }

  if (body.status) {
    const allowed = [
      "TRIAL", "ACTIVE", "PAST_DUE", "PAYMENT_PENDING", "PAYMENT_FAILED",
      "CANCELLED", "EXPIRED", "SUSPENDED",
    ];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `A subscription can be ${allowed.join(", ")}.`, code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }
    data.status = body.status;
    if (body.status === "CANCELLED") data.cancelled_at = new Date();
    if (!detail) detail = `Status set to ${body.status}`;
  }

  if (body.extendTrialDays !== undefined) {
    if (!existing.trial_ends_at) {
      return NextResponse.json(
        { error: "That club is not on a trial.", code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }
    data.trial_ends_at = new Date(
      new Date(existing.trial_ends_at).getTime() + body.extendTrialDays * 86400000,
    );
    if (!detail) detail = `Trial extended by ${body.extendTrialDays} days`;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Nothing to change.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const updated = await prisma.dunda_subscriptions.update({
    where: { id: existing.id },
    data,
  });

  await prisma.dunda_platform_audit_logs.create({
    data: {
      organization_id: existing.organization_id,
      actor_clerk_user_id: session.clerkUserId,
      action: "UPDATE",
      entity: "subscription",
      entity_id: existing.id,
      detail,
      previous_value: {
        planId: existing.plan_id,
        status: existing.status,
        amount: existing.amount,
      },
      new_value: { planId: updated.plan_id, status: updated.status, amount: updated.amount },
    },
  });

  return NextResponse.json({
    id: updated.id,
    planId: updated.plan_id,
    status: updated.status,
    amount: updated.amount,
    renewsAt: updated.renews_at?.toISOString() ?? null,
  });
});
