import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Who the caller is, which club they belong to, and what that club has switched
 * on. The client reads currency and locale from here to format every amount, so
 * it is fetched before any money is rendered.
 */
export const GET = route(async () => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const [organization, staff, branches, roles] = await Promise.all([
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
  ]);
  const settingsRow = await prisma.dunda_organization_settings.findUnique({
    where: { organization_id: organizationId },
    select: { currency: true, timezone: true, tax_rate: true, service_charge_rate: true },
  });

  const currency = settingsRow?.currency ?? organization?.currency ?? "KES";
  const taxRate = settingsRow?.tax_rate ?? organization?.tax_rate ?? 0;
  const serviceChargeRate =
    settingsRow?.service_charge_rate ?? organization?.service_charge_rate ?? 0;

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
    // Only somebody who can hand out access needs the role list; sending it to
    // everyone would invite staff to try roles they cannot grant.
    canGrantStaff: session.permissions.has("manage_staff"),
    operator: session.isOperator,
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
