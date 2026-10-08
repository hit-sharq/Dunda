import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/client";
import {
  route,
  Forbidden,
  NotProvisioned,
  resolveSession,
  orgWhere,
} from "@/lib/server/http";
import { invitationFailureReason, invitationRedirectUrl } from "@/lib/server/clerk";

export const dynamic = "force-dynamic";

export const POST = route(
  async (
    request: Request,
    context: {
      params: Promise<{ organizationId: string; staffId: string }>;
    },
  ) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { organizationId, staffId } = await context.params;

    const member = await prisma.dunda_staff.findFirst({
      where: orgWhere(organizationId, { id: staffId }),
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        clerk_user_id: true,
        dunda_roles: { select: { name: true } },
      },
    });
    if (!member) {
      return NextResponse.json(
        { error: "That person is not on this club's roster.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (member.clerk_user_id) {
      return NextResponse.json(
        {
          error: `${member.name} has already signed up. There is no invitation to resend.`,
          code: "ALREADY_CLAIMED",
        },
        { status: 409 },
      );
    }

    if (member.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error: `${member.name}'s access is ${member.status.toLowerCase()}. Reinstate them before inviting.`,
          code: "WRONG_STATE",
        },
        { status: 409 },
      );
    }

    if (!member.email) {
      return NextResponse.json(
        {
          error: `${member.name} has no email address to invite.`,
          code: "VALIDATION_FAILED",
        },
        { status: 422 },
      );
    }

    let invitation: { sent: boolean; url?: string; reason?: string } = {
      sent: false,
    };
    try {
      const clerk = await clerkClient();
      const created = await clerk.invitations.createInvitation({
        emailAddress: member.email,
        expiresInDays: 7,
        ignoreExisting: true,
        redirectUrl: invitationRedirectUrl(),
      });
      invitation = { sent: true, url: created.url };
    } catch (error) {
      invitation = { sent: false, reason: invitationFailureReason(error) };
    }

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: organizationId,
        actor_clerk_user_id: session.clerkUserId,
        action: "RESEND_INVITATION",
        entity: "staff",
        entity_id: member.id,
        detail: `${member.name} invited again as ${member.dunda_roles.name} on this club by a platform operator${invitation.sent ? "" : " (the invitation did not go out)"}`,
        new_value: { email: member.email, invited: invitation.sent },
      },
    });

    return NextResponse.json({
      id: member.id,
      name: member.name,
      email: member.email,
      invitation,
    });
  },
);
