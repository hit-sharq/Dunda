import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Platform administrators, and every person using the platform underneath them.
 *
 * A platform administrator is named by their Clerk user id, never by an email
 * address or a claim inside a token, so revoking access means deleting a row
 * rather than trusting something the caller says about itself.
 */
export const GET = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "all";

  const [platformUsers, clubStaff, organizations] = await Promise.all([
    prisma.dunda_platform_users.findMany({
      orderBy: { created_at: "desc" },
      take: 100,
      select: {
        id: true,
        clerk_user_id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        last_login_at: true,
        created_at: true,
      },
    }),
    prisma.dunda_staff.findMany({
      // Asking for platform users alone would otherwise return every club user.
      where: scope === "platform" ? { id: "__none__" } : {},
      orderBy: { name: "asc" },
      take: 500,
      select: {
        id: true,
        clerk_user_id: true,
        name: true,
        email: true,
        status: true,
        created_at: true,
        organization_id: true,
        dunda_roles: { select: { name: true, is_owner: true } },
      },
    }),
    prisma.dunda_organizations.findMany({ select: { id: true, name: true } }),
  ]);

  const orgById = new Map(organizations.map((o) => [o.id, o.name]));

  return NextResponse.json({
    administrators: platformUsers.map((u) => ({
      id: u.id,
      clerkUserId: u.clerk_user_id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      lastLoginAt: u.last_login_at?.toISOString() ?? null,
      createdAt: u.created_at.toISOString(),
    })),
    clubUsers: clubStaff.map((s) => ({
      id: s.id,
      clerkUserId: s.clerk_user_id,
      name: s.name,
      email: s.email,
      role: s.dunda_roles.name,
      isOwner: s.dunda_roles.is_owner,
      status: s.status,
      organizationId: s.organization_id,
      organizationName: orgById.get(s.organization_id) ?? "Unknown",
      createdAt: s.created_at.toISOString(),
    })),
    totals: {
      administrators: platformUsers.length,
      activeAdministrators: platformUsers.filter((u) => u.status === "ACTIVE").length,
      clubUsers: clubStaff.length,
      activeClubUsers: clubStaff.filter((s) => s.status === "ACTIVE").length,
      owners: clubStaff.filter((s) => s.dunda_roles.is_owner).length,
    },
  });
});

/**
 * Grants or revokes platform administrator access.
 *
 * The change is recorded in the platform audit log, because the person who loses
 * access is exactly the one who cannot later be asked about it.
 */
export const POST = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const body = (await request.json().catch(() => ({}))) as {
    clerkUserId?: string;
    name?: string;
    email?: string;
    role?: string;
  };

  if (!body.clerkUserId) {
    return NextResponse.json(
      {
        error: "A platform administrator is named by their Clerk user id.",
        code: "VALIDATION_FAILED",
      },
      { status: 422 },
    );
  }

  const existing = await prisma.dunda_platform_users.findUnique({
    where: { clerk_user_id: body.clerkUserId },
  });

  const allowed = ["PLATFORM_ADMIN", "PLATFORM_SUPPORT", "PLATFORM_VIEWER"];
  const role = body.role ?? "PLATFORM_ADMIN";
  if (!allowed.includes(role)) {
    return NextResponse.json(
      { error: `A platform role is ${allowed.join(", ")}.`, code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const user = await prisma.dunda_platform_users.upsert({
    where: { clerk_user_id: body.clerkUserId },
    create: {
      clerk_user_id: body.clerkUserId,
      name: body.name ?? null,
      email: body.email ?? null,
      role,
      status: "ACTIVE",
    },
    update: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.email ? { email: body.email } : {}),
      role,
    },
  });

  await prisma.dunda_platform_audit_logs.create({
    data: {
      actor_clerk_user_id: session.clerkUserId,
      action: existing ? "UPDATE" : "CREATE",
      entity: "platform_user",
      entity_id: user.id,
      detail: `${existing ? "Changed" : "Granted"} ${role} to ${user.name ?? user.clerk_user_id}`,
      previous_value: existing ? { role: existing.role } : undefined,
      new_value: { role },
    },
  });

  return NextResponse.json(
    { id: user.id, clerkUserId: user.clerk_user_id, role: user.role, status: user.status },
    { status: existing ? 200 : 201 },
  );
});
