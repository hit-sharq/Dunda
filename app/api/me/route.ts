import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  route,
  resolveSession,
  orgWhere,
  NotProvisioned,
  Unauthenticated,
  OrganizationSuspended,
} from "@/lib/server/http";
import { MODULES } from "@/lib/server/settings";

export const dynamic = "force-dynamic";


export const GET = route(async () => {
  const session = await resolveSession();
  
  
  if (!session) throw new Unauthenticated();

  
  
  
  
  if (session.isOperator) {
    await prisma.dunda_platform_users
      .upsert({
        where: { clerk_user_id: session.clerkUserId },
        create: { clerk_user_id: session.clerkUserId, role: "PLATFORM_ADMIN", status: "ACTIVE" },
        update: { last_login_at: new Date() },
      })
      .catch((error: unknown) => {
        console.error("[dunda] could not record platform user", error);
      });
  }

  if (session.suspended && !session.isOperator) {
    throw new OrganizationSuspended(session.suspended.reason);
  }

  
  
  
  
  
  if (!session.organizationId) {
    if (!session.isOperator) {
      throw new NotProvisioned();
    }
    return NextResponse.json({
      organizationId: null,
      clerkUserId: session.clerkUserId,
      staff: null,
      branchId: null,
      branches: [],
      role: null,
      roleId: null,
      permissions: [],
      isOwner: false,
      canGrantStaff: false,
      operator: session.isOperator,
      
      
      roles: undefined,
      settings: { currency: "KES", locale: "en-KE", taxRate: 0, serviceChargeRate: 0 },
    });
  }

  const organizationId = session.organizationId;

  const [organization, staff, branches, roles, settingsRow, subscription] =
    await Promise.all([
      prisma.dunda_organizations.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          currency: true,
          tax_rate: true,
          service_charge_rate: true,
        },
      }),
    session.staffId
      ? prisma.dunda_staff.findUnique({
          where: { id: session.staffId },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role_id: true,
            branch_id: true,
            status: true,
          },
        })
      : null,
    prisma.dunda_branches.findMany({
      where: orgWhere(organizationId),
      select: { id: true, name: true, city: true, status: true },
      orderBy: { name: "asc" },
    }),
    prisma.dunda_roles.findMany({
      select: { id: true, name: true, is_owner: true },
      orderBy: { sort_order: "asc" },
    }),
    prisma.dunda_organization_settings.findUnique({
      where: { organization_id: organizationId },
      select: { currency: true, timezone: true, tax_rate: true, service_charge_rate: true },
    }),
    prisma.dunda_subscriptions.findFirst({
      where: { organization_id: organizationId },
      orderBy: { created_at: "desc" },
      select: {
        branch_limit: true,
        dunda_plans: { select: { modules: true } },
      },
    }),
  ]);

  const currency = settingsRow?.currency ?? organization?.currency ?? "KES";
  const taxRate = settingsRow?.tax_rate ?? organization?.tax_rate ?? 0;
  const serviceChargeRate =
    settingsRow?.service_charge_rate ?? organization?.service_charge_rate ?? 0;

  const raw = subscription?.dunda_plans?.modules;
  const modules = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === "string")
    : null;

  return NextResponse.json({
    organizationId,
    clerkUserId: session.clerkUserId,
    staff: staff
      ? {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          roleId: staff.role_id,
          branchId: staff.branch_id,
          status: staff.status,
        }
      : null,
    branchId: session.branchId,
    branches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      city: b.city,
      status: b.status,
    })),
    role: session.roleName,
    roleId: session.roleId,
    permissions: [...session.permissions],
    isOwner: session.isOwner,
    
    
    canGrantStaff: session.permissions.has("manage_staff"),
    operator: session.isOperator,
    branchLimit: subscription?.branch_limit ?? 1,
    modules: modules ?? MODULES,
    roles:
      session.permissions.has("manage_staff") || session.isOwner
        ? roles.map((r) => ({
            id: r.id,
            name: r.name,
            isOwner: r.is_owner,
            grantable: !r.is_owner,
          }))
        : undefined,
    settings: {
      currency,
      locale: localeFor(currency),
      taxRate,
      serviceChargeRate,
    },
  });
});

function localeFor(currency: string): string {
  const map: Record<string, string> = {
    KES: "en-KE",
    USD: "en-US",
    EUR: "de-DE",
    GBP: "en-GB",
    NGN: "en-NG",
    UGX: "en-UG",
    ZAR: "en-ZA",
    TZS: "en-TZ",
  };
  return map[currency] ?? "en";
}