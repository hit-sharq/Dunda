import { NextResponse } from "next/server";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/client";
import {
  route,
  Forbidden,
  NotProvisioned,
  resolveSession,
  orgWhere,
  parseBody,
} from "@/lib/server/http";
import { invitationFailureReason, invitationRedirectUrl } from "@/lib/server/clerk";

export const dynamic = "force-dynamic";

/**
 * A platform operator grants somebody access to a club.
 *
 * This exists because the alternative does not start. Only an owner or general
 * manager can add staff, so a club with nobody signed up yet — which is every new
 * club, and every club whose owner has not opened the app — has nobody who can let
 * the first manager in. The operator is the only party who can, so it is the only
 * one who does.
 *
 * The row written is exactly the row an owner would write: the same table, the
 * same role reference, left unclaimed until the person signs up. Access is still
 * derived from the role, so an operator grants a role and not a hand-picked set of
 * permissions — otherwise this path would become a way around the permission model.
 */
const grantAccessSchema = z.object({
  email: z.string().min(1, "An email address is required."),
  name: z.string().min(1).optional(),
  roleId: z.string().min(1, "Pick a role for them."),
  branchId: z.string().nullable().optional(),
});

export const POST = route(
  async (request: Request, context: { params: Promise<{ organizationId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { organizationId } = await context.params;
    const input = await parseBody(grantAccessSchema, request);
    const email = input.email.trim().toLowerCase();

    const organization = await prisma.dunda_organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!organization) {
      return NextResponse.json(
        { error: "That organization no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const role = await prisma.dunda_roles.findUnique({
      where: { id: input.roleId },
      select: { id: true, name: true, is_owner: true },
    });
    if (!role) {
      return NextResponse.json(
        { error: "That role no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // Ownership is transferred, not handed out. Two owners would each believe they
    // hold the club, and the console has a deliberate flow for changing hands.
    if (role.is_owner) {
      return NextResponse.json(
        {
          error: "The owner role is transferred, not assigned. Use transfer ownership.",
          code: "VALIDATION_FAILED",
        },
        { status: 422 },
      );
    }

    // One person, one place. A staff row already carrying this address would make
    // the claim ambiguous, so the operator is told rather than left to find out.
    const existing = await prisma.dunda_staff.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        organization_id: true,
        clerk_user_id: true,
        dunda_organizations: { select: { name: true } },
      },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: `${existing.name} is already on ${existing.dunda_organizations.name}'s roster with that address. Change their role there instead.`,
          code: "DUPLICATE_STAFF",
          staffId: existing.id,
          name: existing.name,
          organizationId: existing.organization_id,
          claimed: Boolean(existing.clerk_user_id),
        },
        { status: 409 },
      );
    }

    const branchId = input.branchId ?? null;
    if (branchId) {
      const branch = await prisma.dunda_branches.findFirst({
        where: orgWhere(organizationId, { id: branchId }),
        select: { id: true },
      });
      if (!branch) {
        return NextResponse.json(
          { error: "That branch is not part of this club.", code: "NOT_FOUND" },
          { status: 404 },
        );
      }
    }

    // The plan's user limit is a commercial boundary, so it is
    // checked against the live roster rather than a stored
    // counter. An operator who needs more seats for a club
    // changes the plan first.
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
          error: `This club's plan allows ${userLimit} staff member${userLimit === 1 ? "" : "s"}. Change the plan to add another.`,
          code: "USER_LIMIT_REACHED",
          userLimit,
        },
        { status: 422 },
      );
    }

    const member = await prisma.dunda_staff.create({
      data: {
        organization_id: organizationId,
        branch_id: branchId,
        // Deliberately null. The claim in resolveSession links the account the
        // moment they accept the invitation and sign up with this address.
        clerk_user_id: null,
        name: input.name ?? email,
        email,
        role_id: role.id,
        status: "ACTIVE",
      },
      select: { id: true, name: true, email: true, role_id: true, status: true },
    });

    // Clerk sends it, so no mail is ours and the accept link is handled by the
    // provider that will authenticate them next. A failure is reported without
    // undoing the row: the person is on the roster either way and can sign up.
    let invitation: { sent: boolean; reason?: string; url?: string } = { sent: false };
    try {
      const clerk = await clerkClient();
      const created = await clerk.invitations.createInvitation({
        emailAddress: email,
        expiresInDays: 7,
        redirectUrl: invitationRedirectUrl(),
      });
      invitation = { sent: true, url: created.url };
    } catch (error) {
      invitation = {
        sent: false,
        reason: invitationFailureReason(error),
      };
    }

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: organizationId,
        actor_clerk_user_id: session.clerkUserId,
        action: 'GRANT_ACCESS',
        entity: 'staff',
        entity_id: member.id,
        detail: `${member.name} granted ${role.name} on ${organization.name} by a platform operator${invitation.sent ? ' and invited' : ' without an invitation'}`,
        new_value: { email, role: role.name, branchId, invited: invitation.sent },
      },
    });

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
  },
);

/**
 * Removes somebody's access to a club.
 *
 * Suspended rather than deleted: their shifts, orders and stock movements are
 * financial records that have to stay attributable to whoever actually did them.
 * What is taken away is the access.
 */
export const DELETE = route(
  async (request: Request, context: { params: Promise<{ organizationId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { organizationId } = await context.params;
    const url = new URL(request.url);
    const staffId = url.searchParams.get("staffId");
    if (!staffId) {
      return NextResponse.json(
        { error: "Which staff member?", code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    const member = await prisma.dunda_staff.findFirst({
      where: orgWhere(organizationId, { id: staffId }),
      include: { dunda_roles: { select: { name: true, is_owner: true } } },
    });
    if (!member) {
      return NextResponse.json(
        { error: "That person is not on this club's roster.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (member.dunda_roles.is_owner) {
      return NextResponse.json(
        {
          error: "The owner's access cannot be removed. Transfer ownership instead.",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const suspended = await prisma.dunda_staff.update({
      where: { id: staffId },
      data: { status: "SUSPENDED" },
      select: { id: true, name: true, status: true },
    });

    if (member.clerk_user_id) {
      await prisma.dunda_organization_members.updateMany({
        where: { organization_id: organizationId, clerk_user_id: member.clerk_user_id },
        data: { status: "SUSPENDED" },
      });
    }

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: organizationId,
        actor_clerk_user_id: session.clerkUserId,
        action: 'REVOKE_ACCESS',
        entity: 'staff',
        entity_id: staffId,
        detail: `${member.name} removed from ${member.dunda_roles.name} on this club by a platform operator`,
        previous_value: { status: member.status },
        new_value: { status: "SUSPENDED" },
      },
    });

    return NextResponse.json(suspended);
  },
);
