import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requirePermission, orgWhere, assertSameOrg } from "@/lib/server/http";
import { createStaffSchema, createShiftSchema, clockOutSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

/** The staff roster with each person's role and branch. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId");

  const [staff, shifts] = await Promise.all([
    prisma.dunda_staff.findMany({
      where: orgWhere(organizationId, branchId ? { branch_id: branchId } : undefined),
      orderBy: { name: "asc" },
      include: { dunda_roles: { select: { id: true, name: true } } },
    }),
    prisma.dunda_staff_shifts.findMany({
      where: orgWhere(organizationId, {
        branch_id: branchId ?? undefined,
        clock_out_at: null,
        status: "OPEN",
      }),
      select: { id: true, staff_id: true, clock_in_at: true, opening_cash: true },
    }),
  ]);

  const onShift = new Map(shifts.map((s) => [s.staff_id, s]));

  return NextResponse.json(
    staff.map((member) => ({
      id: member.id,
      clerkUserId: member.clerk_user_id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      role: member.dunda_roles.name,
      roleId: member.role_id,
      status: member.status,
      branchId: member.branch_id,
      createdAt: member.created_at.toISOString(),
      onShift: onShift.has(member.id),
      shiftStartedAt: onShift.get(member.id)?.clock_in_at?.toISOString() ?? null,
    })),
  );
});

/**
 * Adds somebody to the roster.
 *
 * A staff row with no role grants nothing, so the role is required rather than
 * defaulted: an account created without one would appear on the roster and be
 * unable to do anything, which is worse than not being created.
 */
export const POST = route(async (request: Request) => {
  const session = await requirePermission("manage_staff");
  const organizationId = session.organizationId as string;

  const body = await request.json().catch(() => ({}));
  const parsed = createStaffSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue ? `${issue.path.join(".") || "staff"}: ${issue.message}` : "Invalid staff member.",
        code: "VALIDATION_FAILED",
      },
      { status: 422 },
    );
  }

  const role = await prisma.dunda_roles.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) {
    return NextResponse.json(
      { error: "That role no longer exists.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // An owner role cannot be handed out by a club: ownership is transferred, not
  // granted, so that the owner of a club is always someone who accepted it.
  if (role.is_owner) {
    return NextResponse.json(
      { error: "The owner role is transferred, not assigned.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  // The plan's user limit is a commercial boundary, so it is
  // checked against the live roster rather than a stored
  // counter, and the refusal says what to do about it.
  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { organization_id: organizationId },
    orderBy: { created_at: "desc" },
    select: { user_limit: true },
  });
  const userLimit = subscription?.user_limit ?? 5;
  const userCount = await prisma.dunda_staff.count({
    where: { organization_id: organizationId, status: "ACTIVE" },
  });
  if (userLimit > 0 && userCount >= userLimit) {
    return NextResponse.json(
      {
        error: `This plan allows ${userLimit} staff member${userLimit === 1 ? "" : "s"}. Upgrade to add another.`,
        code: "USER_LIMIT_REACHED",
        userLimit,
      },
      { status: 422 },
    );
  }

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.dunda_staff.create({
      data: {
        organization_id: organizationId,
        branch_id: parsed.data.branchId ?? session.branchId,
        clerk_user_id: parsed.data.clerkUserId ?? null,
        name: parsed.data.name,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        role_id: role.id,
        status: "ACTIVE",
      },
    });

    if (parsed.data.clerkUserId) {
      await tx.dunda_organization_members.create({
        data: {
          organization_id: organizationId,
          clerk_user_id: parsed.data.clerkUserId,
          role_id: role.id,
        },
      });
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: parsed.data.branchId ?? session.branchId,
        staff_id: session.staffId,
        action: "CREATE",
        entity: "staff",
        entity_id: created.id,
        detail: `${created.name} added as ${role.name}`,
      },
    });

    return created;
  });

  // Clerk sends the invitation, so the club is not running its own mail and does
  // not need its own bounce handling, token store or resend logic. The staff row
  // is already written, so when the person accepts and signs up, their claim
  // matches this address and their role's tabs appear immediately.
  //
  // A failure here is reported but does not undo the row: the person is on the
  // roster either way, and a manager can resend. Losing the invite while losing
  // the person is the worse of the two failures.
  let invitation: { sent: boolean; reason?: string; url?: string } = { sent: false };

  if (!parsed.data.email) {
    invitation = { sent: false, reason: 'No email address was given, so there was nothing to send.' };
  } else {
    try {
      const clerk = await clerkClient();
      const created = await clerk.invitations.createInvitation({
        emailAddress: parsed.data.email,
        // A week is long enough for somebody on a night shift to see it, and short
        // enough that an old invite in a forwarded message is not a live key.
        expiresInDays: 7,
        // They land on the app, signed in, with their tabs already correct.
        redirectUrl: new URL('/', request.url).toString(),
      });
      invitation = { sent: true, url: created.url };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The invitation could not be sent.';
      // Clerk refuses to invite an address that already has an account or a pending
      // invitation. That is information the manager needs, not a crash.
      const alreadyKnown = /already|exists|invited/i.test(message);
      invitation = {
        sent: false,
        reason: alreadyKnown
          ? 'That address already has an account or a pending invitation.'
          : message,
      };
    }
  }

  if (parsed.data.email) {
    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: parsed.data.branchId ?? session.branchId,
        staff_id: session.staffId,
        action: 'INVITE',
        entity: 'staff',
        entity_id: member.id,
        detail: invitation.sent
          ? `Invitation sent to ${parsed.data.email} for ${role.name}`
          : `${member.name} added without an invitation: ${invitation.reason ?? 'unknown reason'}`,
      },
    });
  }

  return NextResponse.json(
    {
      id: member.id,
      name: member.name,
      email: member.email,
      roleId: member.role_id,
      role: role.name,
      status: member.status,
      invitation,
    },
    { status: 201 },
  );
});
