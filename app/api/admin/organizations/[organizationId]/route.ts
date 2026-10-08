import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";
import { getTenantSettings, featureFlags, MODULES } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/**
 * One club, as the platform owner sees it: its people, its branches, what it
 * pays, and which modules it has switched on.
 *
 * This is the support screen. It reads across the tenant boundary deliberately,
 * which is why it requires an operator rather than club membership.
 */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ organizationId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { organizationId } = await context.params;

    const organization = await prisma.dunda_organizations.findUnique({
      where: { id: organizationId },
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
    if (!organization) {
      return NextResponse.json(
        { error: "That organization no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const [branches, staff, subscription, settings, flags, activity] = await Promise.all([
      prisma.dunda_branches.findMany({
        where: { organization_id: organizationId },
        select: { id: true, name: true, city: true, status: true },
      }),
      prisma.dunda_staff.findMany({
        where: { organization_id: organizationId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          clerk_user_id: true,
          dunda_roles: { select: { name: true } },
        },
      }),
      prisma.dunda_subscriptions.findFirst({
        where: { organization_id: organizationId },
        orderBy: { created_at: "desc" },
        include: { dunda_plans: true },
      }),
      getTenantSettings(organizationId),
      featureFlags(organizationId),
      prisma.dunda_activity.findMany({
        where: { organization_id: organizationId },
        orderBy: { timestamp: "desc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      domain: organization.domain,
      currency: organization.currency,
      status: organization.status,
      suspendedAt: organization.suspended_at?.toISOString() ?? null,
      suspendedReason: organization.suspended_reason,
      createdAt: organization.created_at.toISOString(),
      lastActivityAt: organization.last_activity_at?.toISOString() ?? null,
      branches,
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        status: s.status,
        role: s.dunda_roles.name,
        claimed: Boolean(s.clerk_user_id),
      })),
      subscription: subscription
        ? {
            id: subscription.id,
            planId: subscription.plan_id,
            planName: subscription.dunda_plans?.name ?? subscription.plan,
            status: subscription.status,
            billingCycle: subscription.billing_cycle,
            amount: subscription.amount,
            currency: subscription.currency,
            trialEndsAt: subscription.trial_ends_at?.toISOString() ?? null,
            renewsAt: subscription.renews_at?.toISOString() ?? null,
          }
        : null,
      settings,
      // The full module list is returned, not just the ones with rows, so a
      // module nobody has touched reads as ON rather than as missing.
      features: MODULES.map((module) => ({ module, enabled: flags[module] ?? true })),
      activity: activity.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        detail: a.detail,
        amount: a.amount,
        at: a.timestamp.toISOString(),
      })),
    });
  },
);

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ organizationId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { organizationId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      currency?: string;
      taxRate?: number;
      serviceChargeRate?: number;
      status?: string;
      reason?: string;
    };

    const status = body.status;
    const allowed = ["ACTIVE", "SUSPENDED"];
    if (status !== undefined && !allowed.includes(status)) {
      return NextResponse.json(
        { error: `An organization can be ${allowed.join(" or ")}.`, code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    if (status === "SUSPENDED" && !body.reason?.trim()) {
      return NextResponse.json(
        { error: "Say why the club is being suspended.", code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    const touchesSettings =
      body.name !== undefined ||
      body.currency !== undefined ||
      body.taxRate !== undefined ||
      body.serviceChargeRate !== undefined;
    if (status === undefined && !touchesSettings) {
      return NextResponse.json(
        { error: "Nothing to change.", code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    const organization = await prisma.dunda_organizations.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        currency: true,
        tax_rate: true,
        service_charge_rate: true,
        status: true,
      },
    });
    if (!organization) {
      return NextResponse.json(
        { error: "That organization no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const updated = await prisma.dunda_organizations.update({
      where: { id: organizationId },
      data: {
        ...(body.name !== undefined && body.name.trim()
          ? { name: body.name.trim() }
          : {}),
        ...(body.currency !== undefined
          ? { currency: body.currency.toUpperCase() }
          : {}),
        ...(body.taxRate !== undefined ? { tax_rate: body.taxRate } : {}),
        ...(body.serviceChargeRate !== undefined
          ? { service_charge_rate: body.serviceChargeRate }
          : {}),
        ...(status !== undefined
          ? {
              status,
              suspended_at: status === "SUSPENDED" ? new Date() : null,
              suspended_reason:
                status === "SUSPENDED" ? body.reason?.trim() ?? null : null,
            }
          : {}),
      },
      select: { id: true, name: true, status: true, suspended_reason: true },
    });

    if (touchesSettings) {
      await prisma.dunda_organization_settings.upsert({
        where: { organization_id: organizationId },
        create: {
          organization_id: organizationId,
          currency: body.currency?.toUpperCase() ?? organization.currency,
          timezone: "Africa/Nairobi",
          tax_rate: body.taxRate ?? organization.tax_rate,
          service_charge_rate:
            body.serviceChargeRate ?? organization.service_charge_rate,
        },
        update: {
          ...(body.currency !== undefined
            ? { currency: body.currency.toUpperCase() }
            : {}),
          ...(body.taxRate !== undefined ? { tax_rate: body.taxRate } : {}),
          ...(body.serviceChargeRate !== undefined
            ? { service_charge_rate: body.serviceChargeRate }
            : {}),
        },
      });
    }

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: organizationId,
        actor_clerk_user_id: session.clerkUserId,
        action:
          status === "SUSPENDED"
            ? "SUSPEND"
            : status === "ACTIVE"
              ? "REACTIVATE"
              : "UPDATE",
        entity: "organization",
        entity_id: organizationId,
        detail:
          status === "SUSPENDED"
            ? `${updated.name} suspended: ${body.reason?.trim() ?? ""}`
            : status === "ACTIVE"
              ? `${updated.name} reinstated`
              : `${updated.name} settings changed`,
        previous_value:
          status !== undefined ? { status: organization.status } : undefined,
        new_value: {
          ...(status !== undefined ? { status } : {}),
          ...(body.name !== undefined && body.name.trim()
            ? { name: body.name.trim() }
            : {}),
          ...(body.currency !== undefined
            ? { currency: body.currency.toUpperCase() }
            : {}),
          ...(body.taxRate !== undefined ? { taxRate: body.taxRate } : {}),
          ...(body.serviceChargeRate !== undefined
            ? { serviceChargeRate: body.serviceChargeRate }
            : {}),
        },
      },
    });

    return NextResponse.json(updated);
  },
);
