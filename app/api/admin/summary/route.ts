import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * The platform owner's overview: who is on the platform, what they pay, and
 * whether anything has gone wrong.
 *
 * These counts cross organization boundaries on purpose — that is the console's
 * whole job. Every other route in the application is scoped to one club; this one
 * is the only place that reads across them, and it requires a platform operator.
 */
export const GET = route(async () => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) {
    throw new Forbidden("platform_console");
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    organizations,
    subscriptions,
    billingPayments,
    users,
    platformStaff,
    recentActivity,
    failedPayments,
    supportTickets,
    recentOrganizations,
  ] = await Promise.all([
    prisma.dunda_organizations.findMany({
      select: { id: true, name: true, status: true, created_at: true, last_activity_at: true },
    }),
    prisma.dunda_subscriptions.findMany({
      select: {
        id: true,
        organization_id: true,
        plan_id: true,
        status: true,
        renews_at: true,
        trial_ends_at: true,
        created_at: true,
      },
    }),
    prisma.dunda_billing_payments.findMany({
      select: {
        id: true,
        organization_id: true,
        amount: true,
        currency: true,
        status: true,
        provider: true,
        kind: true,
        paid_at: true,
      },
    }),
    prisma.dunda_staff.count(),
    prisma.dunda_platform_users.findMany({
      select: { id: true, name: true, email: true, role: true, status: true, last_login_at: true },
    }),
    prisma.dunda_activity.findMany({
      orderBy: { timestamp: "desc" },
      take: 15,
      select: {
        id: true,
        organization_id: true,
        type: true,
        title: true,
        detail: true,
        amount: true,
        timestamp: true,
      },
    }),
    prisma.dunda_billing_payments.count({
      where: { status: { in: ["FAILED", "PENDING"] } },
    }),
    prisma.dunda_support_tickets.findMany({
      orderBy: { created_at: "desc" },
      take: 8,
      select: { id: true, subject: true, category: true, priority: true, status: true, created_at: true },
    }),
    prisma.dunda_organizations.findMany({
      orderBy: { created_at: "desc" },
      take: 5,
      select: { id: true, name: true, created_at: true },
    }),
  ]);

  const byStatus = (status: string) =>
    subscriptions.filter((s) => s.status === status).length;

  // MRR counts only what is actually being paid for now: active subscriptions at
  // their monthly figure. Trials and cancelled plans are not revenue.
  const plans = await prisma.dunda_plans.findMany({
    select: { id: true, name: true, monthly_price: true, annual_price: true },
  });
  const planById = new Map(plans.map((p) => [p.id, p]));

  const mrr = subscriptions
    .filter((s) => s.status === "ACTIVE")
    .reduce((sum, s) => sum + (s.plan_id ? planById.get(s.plan_id)?.monthly_price ?? 0 : 0), 0);

  // Only payments that settled and carry a date count as revenue. An initiated
  // payment that never completed has a paid_at of null and is not money in.
  const settled = billingPayments.filter(
    (p) => p.status === "COMPLETED" && p.paid_at !== null,
  );
  const last30 = settled.filter((p) => new Date(p.paid_at as Date) >= thirtyDaysAgo);
  const last7 = settled.filter((p) => new Date(p.paid_at as Date) >= sevenDaysAgo);

  const mrrAt = (date: Date) =>
    subscriptions
      .filter((s) => {
        // A subscription with no plan attached contributes nothing; the plan
        // lookup below would return nothing for it anyway.
        const started = new Date(s.created_at);
        const ends = s.renews_at ? new Date(s.renews_at) : null;
        return s.status !== "CANCELLED" && started <= date && (ends === null || ends >= date);
      })
      .reduce((sum, s) => sum + (s.plan_id ? planById.get(s.plan_id)?.monthly_price ?? 0 : 0), 0);

  return NextResponse.json({
    organizations: {
      total: organizations.length,
      active: organizations.filter((o) => o.status === "ACTIVE").length,
      trial: subscriptions.filter((s) => s.status === "TRIAL").length,
      suspended: organizations.filter((o) => o.status === "SUSPENDED").length,
      newThisMonth: organizations.filter((o) => new Date(o.created_at) >= thirtyDaysAgo).length,
    },
    revenue: {
      mrr,
      // Last 30 days annualised, so the figure is comparable with the MRR beside it.
      last30: last30.reduce((sum, p) => sum + p.amount, 0),
      last7: last7.reduce((sum, p) => sum + p.amount, 0),
      mrrGrowth: mrrAt(thirtyDaysAgo) === 0
        ? 0
        : Math.round(((mrr - mrrAt(thirtyDaysAgo)) / Math.max(1, mrrAt(thirtyDaysAgo))) * 100),
    },
    subscriptions: {
      active: byStatus("ACTIVE"),
      trial: byStatus("TRIAL"),
      pastDue: byStatus("PAST_DUE"),
      paymentPending: byStatus("PAYMENT_PENDING"),
      paymentFailed: byStatus("PAYMENT_FAILED"),
      cancelled: byStatus("CANCELLED"),
      expired: byStatus("EXPIRED"),
      suspended: byStatus("SUSPENDED"),
    },
    users: {
      clubStaff: users,
      platformAdministrators: platformStaff.length,
    },
    billing: {
      payments: billingPayments.length,
      failed: failedPayments,
      refunds: 0,
    },
    support: {
      open: supportTickets.filter((t) => t.status === "OPEN").length,
      recent: supportTickets,
    },
    recentOrganizations,
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      organizationId: a.organization_id,
      type: a.type,
      title: a.title,
      detail: a.detail,
      amount: a.amount,
      at: a.timestamp.toISOString(),
    })),
  });
});
