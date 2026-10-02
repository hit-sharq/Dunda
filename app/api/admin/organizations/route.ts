import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Every club on the platform, with what it pays and how much it uses.
 *
 * Organization names, owners and branches are listed together so the platform
 * owner can see at a glance which clubs are active and which have gone quiet.
 */
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
      status: true,
      suspended_at: true,
      suspended_reason: true,
      created_at: true,
      last_activity_at: true,
    },
  });

  const [branches, members, subscriptions, plans, staff] = await Promise.all([
    prisma.dunda_branches.groupBy({ by: ["organization_id"], _count: { _all: true } }),
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
  const branchCount = new Map(branches.map((b) => [b.organization_id, b._count._all]));
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
        branches: branchCount.get(org.id) ?? 0,
        users: memberCount.get(org.id) ?? 0,
        staffCount: orgStaff.length,
        owner: orgStaff.find((s) => s.status === "ACTIVE")?.name ?? null,
        planId: sub?.plan_id ?? null,
        planName: plan?.name ?? null,
        subscriptionStatus: sub?.status ?? "NONE",
        trialEndsAt: sub?.trial_ends_at?.toISOString() ?? null,
        renewsAt: sub?.renews_at?.toISOString() ?? null,
        createdAt: org.created_at.toISOString(),
        lastActivityAt: org.last_activity_at?.toISOString() ?? null,
      };
    }),
  );
});
