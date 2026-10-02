import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, resolveSession, orgWhere, Unauthenticated } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Who the caller is, what they may do, and — for a platform operator — whether
 * they run any club at all.
 *
 * This answers for an operator who owns no club. That is the normal state for
 * somebody whose job is provisioning clubs, so refusing them here would hide the
 * console behind an error the moment they signed in. The club fields are simply
 * null for them and the client routes them straight to /admin.
 */
export const GET = route(async () => {
  const session = await resolveSession();
  // Nobody signed in at all is a 401, not a 403. The client tells these apart:
  // 401 means sign in, 403 means you are signed in and your account is not set up.
  if (!session) throw new Unauthenticated();

  // A platform operator is recorded on first sight so the console can show who
  // they are and attribute their actions in the audit trail. Failing to write this
  // row is not a reason to refuse the read: the allow-list in the environment is
  // what grants access, and the row is only a record of it.
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

  // Everything below is club-scoped, so an operator with no membership skips it
  // rather than querying a null organization.
  if (!session.organizationId) {
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
      // An operator needs the plan catalogue to provision a club, so it is sent to
      // them even though they hold no club role.
      roles: undefined,
      settings: { currency: "KES", locale: "en-KE", taxRate: 0, serviceChargeRate: 0 },
    });
  }

  const organizationId = session.organizationId;

  const [organization, staff, branches, roles, settingsRow] = await Promise.all([
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
  ]);

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
