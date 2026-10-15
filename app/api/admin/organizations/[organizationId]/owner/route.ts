import { NextResponse } from "next/server";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession, parseBody } from "@/lib/server/http";
import { invitationFailureReason, invitationRedirectUrl } from "@/lib/server/clerk";

export const dynamic = "force-dynamic";


const assignOwnerSchema = z
  .object({
    email: z.string().trim().min(1, "An email address is required."),
    name: z.string().trim().optional(),
    clerkUserId: z.string().optional(),
    roleId: z.string().optional(),
  })
  .transform((input) => ({
    email: input.email,
    name: input.name || undefined,
    clerkUserId: input.clerkUserId || undefined,
    roleId: input.roleId || undefined,
  }));

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

    
    
    let invitation: { sent: boolean; reason?: string } = { sent: false };
    try {
      const clerk = await clerkClient();
      await clerk.invitations.createInvitation({
        emailAddress: input.email,
        expiresInDays: 7,
        redirectUrl: invitationRedirectUrl(),
      });
      invitation = { sent: true };
    } catch (error) {
      invitation = { sent: false, reason: invitationFailureReason(error) };
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