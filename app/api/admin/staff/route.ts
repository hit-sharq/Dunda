import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";


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


export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 20, 60 * 60 * 1000);

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

  // Prevent an operator from demoting themselves or purging all platform admins
  if (body.clerkUserId === session.clerkUserId && body.role && body.role !== "PLATFORM_ADMIN") {
    return NextResponse.json(
      {
        error: "You cannot change your own platform role.",
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

  // Prevent demoting the last remaining PLATFORM_ADMIN
  if (existing && existing.role === "PLATFORM_ADMIN" && role !== "PLATFORM_ADMIN") {
    const adminCount = await prisma.dunda_platform_users.count({
      where: { role: "PLATFORM_ADMIN", status: "ACTIVE" },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        {
          error: "Cannot demote the last platform administrator. Assign another administrator first.",
          code: "VALIDATION_FAILED",
        },
        { status: 422 },
      );
    }
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