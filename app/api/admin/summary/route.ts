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
        billing_cycle: true,
        amount: true,
        cancelled_at: true,
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

  // MRR counts only what is actually being paid for now: active subscriptions at
  // their monthly figure. Trials and cancelled plans are not revenue.
  const plans = await prisma.dunda_plans.findMany({
    select: { id: true, name: true, monthly_price: true, annual_price: true },
  });
  const planById = new Map(plans.map((p) => [p.id, p]));

  // Only payments that settled and carry a date count as revenue. An initiated
  // payment that never completed has a paid_at of null and is not money in.
  const settled = billingPayments.filter(
    (p) => p.status === "COMPLETED" && p.paid_at !== null,
  );
  const last30 = settled.filter((p) => new Date(p.paid_at as Date) >= thirtyDaysAgo);

  // Counts what clubs are committed to per month, and separately what has
  // actually been collected. The two are not the same number: a club on an
  // annual plan is one commitment but twelve instalments, and a club whose
  // payment failed is still committed until somebody chases it.
  const activeSubs = subscriptions.filter((s) => s.status === "ACTIVE");
  const mrr = activeSubs.reduce(
    (sum, s) => sum + (s.billing_cycle === "ANNUAL" ? (s.amount || 0) / 12 : s.amount || 0),
    0,
  );
  const collected = settled.reduce((sum, p) => sum + p.amount, 0);

  // "Live" means serving tonight: not suspended, and not cancelled.
  const live = organizations.filter(
    (o) => o.status !== "SUSPENDED" && o.status !== "CANCELLED",
  ).length;
  const activeBranches = await prisma.dunda_branches.count({
    where: { organization_id: { in: organizations.map((o) => o.id) }, status: "LIVE" },
  });

  const [clubPayments, clubOrders, clubStaffCount] = await Promise.all([
    prisma.dunda_payments.count({
      where: {
        organization_id: { in: organizations.map((o) => o.id) },
        status: { not: "VOIDED" },
        paid_at: { gte: thirtyDaysAgo },
      },
    }),
    prisma.dunda_orders.count({
      where: {
        organization_id: { in: organizations.map((o) => o.id) },
        created_at: { gte: thirtyDaysAgo },
      },
    }),
    prisma.dunda_staff.count({
      where: { organization_id: { in: organizations.map((o) => o.id) } },
    }),
  ]);

  // The clubs' own trading, which is their revenue and emphatically not Dunda's.
  const clubRevenue = await prisma.dunda_payments.aggregate({
    where: {
      organization_id: { in: organizations.map((o) => o.id) },
      status: { not: "VOIDED" },
      paid_at: { gte: thirtyDaysAgo },
    },
    _sum: { amount: true },
  });

  return NextResponse.json({
    clubs: organizations.length,
    activeBranches,
    newClubsThisMonth: organizations.filter((o) => new Date(o.created_at) >= thirtyDaysAgo).length,
    activeClubs: live,
    trialClubs: subscriptions.filter((s) => s.status === "TRIAL").length,
    suspendedClubs: organizations.filter((o) => o.status === "SUSPENDED").length,
    cancelledClubs: subscriptions.filter((s) => s.status === "CANCELLED").length,
    expiredClubs: subscriptions.filter((s) => s.status === "EXPIRED").length,
    pastDueClubs: subscriptions.filter((s) => s.status === "PAST_DUE").length,
    // A club that stopped paying within the window, rather than one that was
    // never on the platform.
    churnedLast30Days: subscriptions.filter(
      (s) =>
        s.status === "CANCELLED" &&
        s.cancelled_at !== null &&
        new Date(s.cancelled_at) >= thirtyDaysAgo,
    ).length,
    mrr,
    collected,
    activeStaff: users,
    totalStaff: users + platformStaff.length,
    ordersInWindow: clubOrders,
    clubRevenueInWindow: clubRevenue._sum.amount ?? 0,
    windowDays: 30,
  });
});
