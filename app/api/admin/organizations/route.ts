import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession, parseBody } from "@/lib/server/http";
import { initiateBillingPayment } from "@/lib/server/payments";

export const dynamic = "force-dynamic";

/**
 * Every club on the platform, with what it pays and how much it uses.
 *
 * Organization names, owners and branches are listed together so the platform
 * owner can see at a glance which clubs are active and which have gone quiet.
 */
/**
 * Provisions a club.
 *
 * A club exists before anybody signs up for it: the venue and its first branch
 * are created here, and an owner is attached afterwards by transferring ownership.
 * Nothing inside a club can do this, which is why the venue count is the
 * platform owner's to decide rather than something a signup form creates.
 *
 * The trial starts at creation because a club that has just been set up has paid
 * nothing yet, and the console shows that as a trial until money arrives.
 */
const createOrganizationSchema = z.object({
  name: z.string().min(1, "A club needs a name."),
  branchName: z.string().min(1).default("Main Branch"),
  city: z.string().default(""),
  currency: z.string().min(3).max(3).default("KES"),
  taxRate: z.number().int().min(0).max(100).default(0),
  serviceChargeRate: z.number().int().min(0).max(100).default(0),
  planId: z.string().nullable().optional(),
});

export const POST = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const input = await parseBody(createOrganizationSchema, request);

  // The slug is the club's public handle and must be unique. Deriving it from the
  // name and appending a counter keeps two clubs called "Singapore Club" apart
  // rather than refusing the second.
  const base =
    input.name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "club";

  let slug = base;
  for (let attempt = 2; attempt < 100; attempt++) {
    const taken = await prisma.dunda_organizations.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!taken) break;
    slug = `${base}-${attempt}`;
  }

  const plan = input.planId
    ? await prisma.dunda_plans.findUnique({ where: { id: input.planId } })
    : await prisma.dunda_plans.findFirst({
        where: { is_active: true },
        orderBy: { sort_order: "asc" },
      });

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const organization = await prisma.$transaction(async (tx) => {
    const org = await tx.dunda_organizations.create({
      data: {
        name: input.name,
        slug,
        currency: input.currency.toUpperCase(),
        tax_rate: input.taxRate,
        service_charge_rate: input.serviceChargeRate,
        status: "ACTIVE",
        last_activity_at: new Date(),
      },
    });

    const branch = await tx.dunda_branches.create({
      data: {
        organization_id: org.id,
        name: input.branchName,
        // The column is not nullable, so a club provisioned without a city gets
        // an empty string rather than a null the rest of the code would trip over.
        city: input.city || "",
        status: "ACTIVE",
        // The branch carries the club's zone so "today's takings" means the local
        // trading day rather than a UTC slice that cuts the evening in half.
        timezone: "Africa/Nairobi",
      },
    });

    // Rates are stored on the club as well as the organization row, so a venue
    // created without this step still trades at the right tax rate.
    await tx.dunda_organization_settings.create({
      data: {
        organization_id: org.id,
        currency: input.currency.toUpperCase(),
        timezone: "Africa/Nairobi",
        tax_rate: input.taxRate,
        service_charge_rate: input.serviceChargeRate,
      },
    });

    // Modules are switched on explicitly rather than left absent, so the console
    // shows the same list for a new club as for a long-standing one.
    for (const module of [
      "pos", "floor", "pool", "orders", "inventory", "products", "customers",
      "reservations", "events", "staff", "payments", "expenses", "reports",
    ]) {
      await tx.dunda_organization_features.create({
        data: { organization_id: org.id, module, enabled: true },
      });
    }

    const subscription = await tx.dunda_subscriptions.create({
      data: {
        organization_id: org.id,
        plan_id: plan?.id ?? null,
        plan: plan?.code ?? "STARTER",
        status: "TRIAL",
        billing_cycle: "MONTHLY",
        amount: plan?.monthly_price ?? 0,
        currency: input.currency.toUpperCase(),
        branch_limit: plan?.branch_limit ?? 1,
        user_limit: plan?.user_limit ?? 5,
        current_branches: 1,
        trial_ends_at: trialEndsAt,
      },
    });

    return { org, branch, subscription };
  });

  await prisma.dunda_platform_audit_logs.create({
    data: {
      organization_id: organization.org.id,
      actor_clerk_user_id: session.clerkUserId,
      action: "CREATE",
      entity: "organization",
      entity_id: organization.org.id,
      detail: `${organization.org.name} provisioned on a trial to ${trialEndsAt.toISOString().slice(0, 10)}`,
      new_value: { slug, plan: plan?.code ?? "STARTER", branch: organization.branch.name },
    },
  });

  // A club's first bill goes out with the club
  // itself: the owner pays from their own home
  // screen rather than being chased afterwards.
  // Without a provider configured the club is
  // still provisioned — the operator collects
  // by hand from the console.
  let payment: {
    billingPaymentId: string;
    orderTrackingId: string;
    redirectUrl: string;
    amount: number;
    currency: string;
  } | null = null;
  let paymentFailed = false;
  if (organization.subscription.amount > 0) {
    payment = await initiateBillingPayment({
      organizationId: organization.org.id,
      subscriptionId: organization.subscription.id,
      kind: "SUBSCRIPTION_FIRST",
      autoRenew: true,
    })
      .then((initiation) => ({
        billingPaymentId: initiation.billingPaymentId,
        orderTrackingId: initiation.orderTrackingId,
        redirectUrl: initiation.redirectUrl,
        amount: initiation.amount,
        currency: initiation.currency,
      }))
      .catch((error: unknown) => {
        console.error(
          "[dunda] could not start the first subscription payment",
          error,
        );
        paymentFailed = true;
        return null;
      });
  }

  return NextResponse.json(
    {
      id: organization.org.id,
      name: organization.org.name,
      slug,
      branchId: organization.branch.id,
      trialEndsAt: trialEndsAt.toISOString(),
      payment,
      paymentFailed,
    },
    { status: 201 },
  );
});

export const GET = route(async () => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const organizations = await prisma.dunda_organizations.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      currency: true,
      tax_rate: true,
      service_charge_rate: true,
      status: true,
      suspended_at: true,
      suspended_reason: true,
      created_at: true,
      last_activity_at: true,
    },
  });

  const [branches, liveBranches, members, subscriptions, plans, staff] = await Promise.all([
    prisma.dunda_branches.groupBy({ by: ["organization_id"], _count: { _all: true } }),
    prisma.dunda_branches.groupBy({
      by: ["organization_id"],
      where: { status: "LIVE" },
      _count: { _all: true },
    }),
    prisma.dunda_organization_members.groupBy({
      by: ["organization_id"],
      _count: { _all: true },
    }),
    prisma.dunda_subscriptions.findMany({
      select: {
        id: true,
        organization_id: true,
        plan_id: true,
        status: true,
        trial_ends_at: true,
        renews_at: true,
        created_at: true,
      },
    }),
    prisma.dunda_plans.findMany({
      select: { id: true, name: true, monthly_price: true, annual_price: true },
    }),
    prisma.dunda_staff.findMany({
      select: { id: true, organization_id: true, name: true, email: true, status: true },
    }),
  ]);

  const planById = new Map(plans.map((p) => [p.id, p]));

  // Per-club trading over the window, counted from the clubs' own payments. This
  // is their revenue — it is what tells an operator whether a club is actually
  // using what it pays for.
  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const orgIds = organizations.map((o) => o.id);
  const [revenueByOrg, ordersByOrg, tableCounts, lastPaid] = await Promise.all([
    prisma.dunda_payments.groupBy({
      by: ["organization_id"],
      where: {
        organization_id: { in: orgIds },
        status: { not: "VOIDED" },
        paid_at: { gte: windowStart },
      },
      _sum: { amount: true },
    }),
    prisma.dunda_orders.groupBy({
      by: ["organization_id"],
      where: { organization_id: { in: orgIds }, created_at: { gte: windowStart } },
      _count: { _all: true },
    }),
    prisma.dunda_tables.groupBy({
      by: ["organization_id"],
      where: { organization_id: { in: orgIds } },
      _count: { _all: true },
    }),
    prisma.dunda_payments.groupBy({
      by: ["organization_id"],
      where: { organization_id: { in: orgIds }, status: { not: "VOIDED" } },
      _max: { paid_at: true },
    }),
  ]);
  const revenueMap = new Map(revenueByOrg.map((r) => [r.organization_id, r._sum.amount ?? 0]));
  const ordersMap = new Map(ordersByOrg.map((o) => [o.organization_id, o._count._all]));
  const tableMap = new Map(tableCounts.map((t) => [t.organization_id, t._count._all]));
  const lastPaidMap = new Map(lastPaid.map((p) => [p.organization_id, p._max.paid_at]));
  const branchCount = new Map(branches.map((b) => [b.organization_id, b._count._all]));
  const liveBranchCount = new Map(
    liveBranches.map((b) => [b.organization_id, b._count._all]),
  );
  const memberCount = new Map(members.map((m) => [m.organization_id, m._count._all]));
  const subByOrg = new Map<string, (typeof subscriptions)[number]>();
  for (const sub of subscriptions) {
    // One live subscription per club. If a club somehow has several, the most
    // recent is the one that describes its current plan.
    const existing = subByOrg.get(sub.organization_id);
    if (!existing || new Date(sub.created_at) > new Date(existing.created_at)) {
      subByOrg.set(sub.organization_id, sub);
    }
  }

  return NextResponse.json(
    organizations.map((org) => {
      const sub = subByOrg.get(org.id);
      const plan = sub?.plan_id ? planById.get(sub.plan_id) : null;
      const orgStaff = staff.filter((s) => s.organization_id === org.id);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        domain: org.domain,
        currency: org.currency,
        status: org.status,
        suspendedAt: org.suspended_at?.toISOString() ?? null,
        suspendedReason: org.suspended_reason,
        taxRate: org.tax_rate,
        serviceChargeRate: org.service_charge_rate,
        branches: branchCount.get(org.id) ?? 0,
        liveBranches: (liveBranchCount.get(org.id) ?? 0),
        staff: orgStaff.length,
        activeStaff: orgStaff.filter((s) => s.status === "ACTIVE").length,
        tables: tableMap.get(org.id) ?? 0,
        ordersInWindow: ordersMap.get(org.id) ?? 0,
        revenueInWindow: revenueMap.get(org.id) ?? 0,
        lastOrderAt: lastPaidMap.get(org.id)?.toISOString() ?? null,
        plan: plan?.name ?? null,
        subscriptionStatus: sub?.status ?? null,
        users: memberCount.get(org.id) ?? 0,
        staffCount: orgStaff.length,
        owner: orgStaff.find((s) => s.status === "ACTIVE")?.name ?? null,
        planId: sub?.plan_id ?? null,
        planName: plan?.name ?? null,
        trialEndsAt: sub?.trial_ends_at?.toISOString() ?? null,
        renewsAt: sub?.renews_at?.toISOString() ?? null,
        lastActivityAt: org.last_activity_at?.toISOString() ?? null,
      };
    }),
  );
});
