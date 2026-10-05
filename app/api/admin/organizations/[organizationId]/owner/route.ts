import { NextResponse } from "next/server";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession, parseBody } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Transfers ownership of a club to somebody.
 *
 * Ownership is transferred, never granted from a list of names. A club's owner is
 * always someone who accepted the role, so this needs a Clerk user id: there is
 * no way to make somebody an owner of a club they do not have an account for.
 *
 * A club has one owner, so making somebody else one demotes the previous owner to
 * the general manager rather than leaving two owners who each believe they hold
 * the club.
 */
const assignOwnerSchema = z.object({
  // The email is what identifies the owner. A Clerk user id is an internal
  // identifier the operator has no way of knowing, and requiring one made this
  // unusable from the console.
  email: z.string().min(1, "An email address is required."),
  name: z.string().min(1).optional(),
  clerkUserId: z.string().optional(),
  roleId: z.string().optional(),
});

export const POST = route(
  async (request: Request, context: { params: Promise<{ organizationId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { organizationId } = await context.params;
    const input = await parseBody(assignOwnerSchema, request);

    const organization = await prisma.dunda_organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!organization) {
      return NextResponse.json(
        { error: "That club no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const ownerRole = await prisma.dunda_roles.findFirst({ where: { is_owner: true } });
    if (!ownerRole) {
      return NextResponse.json(
        { error: "This installation has no owner role configured.", code: "NOT_CONFIGURED" },
        { status: 422 },
      );
    }

    // The previous owner steps down to general manager rather than losing access
    // entirely. They may be the person doing the running of the club.
    const generalManager = await prisma.dunda_roles.findFirst({
      where: { name: { equals: "General Manager" } },
    });

    const result = await prisma.$transaction(async (tx) => {
      const previousOwner = await tx.dunda_staff.findFirst({
        where: { organization_id: organizationId, role_id: ownerRole.id },
        select: { id: true, name: true, role_id: true },
      });

      let demoted: { id: string; name: string } | null = null;
      if (previousOwner && generalManager && previousOwner.id !== undefined) {
        await tx.dunda_staff.update({
          where: { id: previousOwner.id },
          data: { role_id: generalManager.id },
        });
        demoted = { id: previousOwner.id, name: previousOwner.name };
      }

      // The staff row is what grants permissions, so it is written from the
      // invitation details and left unclaimed. When the owner accepts the
      // invitation and signs up with this address, resolveSession matches on it
      // and links their account — which is the same path every other staff member
      // takes.
      const owner = await tx.dunda_staff.create({
        data: {
          organization_id: organizationId,
          clerk_user_id: input.clerkUserId ?? null,
          name: input.name ?? input.email,
          email: input.email.toLowerCase(),
          role_id: ownerRole.id,
          status: "ACTIVE",
        },
        select: { id: true, name: true, email: true, clerk_user_id: true },
      });

      // A membership row only exists once there is an account to attach, so it is
      // left for the claim to write rather than created against a null id.
      return { owner, demoted };
    });

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: organizationId,
        actor_clerk_user_id: session.clerkUserId,
        action: "TRANSFER_OWNERSHIP",
        entity: "organization",
        entity_id: organizationId,
        detail: `${organization.name} ownership transferred to ${result.owner.name}`,
        previous_value: result.demoted
          ? { owner: result.demoted.name, ownerId: result.demoted.id }
          : undefined,
        new_value: { owner: result.owner.name, ownerId: result.owner.id },
      },
    });

    // Clerk sends the invitation, so no mail is ours to deliver and the accept
    // link is handled by the same provider that authenticates them afterwards.
    let invitation: { sent: boolean; reason?: string } = { sent: false };
    try {
      const clerk = await clerkClient();
      await clerk.invitations.createInvitation({
        emailAddress: input.email,
        expiresInDays: 7,
        redirectUrl: new URL('/', request.url).toString(),
      });
      invitation = { sent: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The invitation could not be sent.';
      invitation = {
        sent: false,
        reason: /already|exists|invited/i.test(message)
          ? 'That address already has an account or a pending invitation.'
          : message,
      };
    }

    return NextResponse.json({
      owner: {
        id: result.owner.id,
        name: result.owner.name,
        email: result.owner.email,
        clerkUserId: result.owner.clerk_user_id,
        linked: Boolean(result.owner.clerk_user_id),
      },
      demoted: result.demoted,
      invitation,
    });
  },
);
