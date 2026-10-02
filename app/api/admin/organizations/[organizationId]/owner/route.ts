import { NextResponse } from "next/server";
import { z } from "zod";
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
  clerkUserId: z.string().min(1, "Whose account? A Clerk user id is required."),
  name: z.string().min(1).optional(),
  email: z.string().nullable().optional(),
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

      // The membership row is what ties a Clerk account to the club. The staff
      // row is what that membership grants permissions through.
      const member = await tx.dunda_organization_members.upsert({
        where: {
          organization_id_clerk_user_id: {
            organization_id: organizationId,
            clerk_user_id: input.clerkUserId,
          },
        },
        create: {
          organization_id: organizationId,
          clerk_user_id: input.clerkUserId,
          role_id: ownerRole.id,
          status: "ACTIVE",
        },
        update: { role_id: ownerRole.id, status: "ACTIVE" },
      });

      const owner = await tx.dunda_staff.upsert({
        where: { id: member.id },
        create: {
          id: member.id,
          organization_id: organizationId,
          clerk_user_id: input.clerkUserId,
          name: input.name ?? input.email ?? "Owner",
          email: input.email ?? null,
          role_id: input.roleId && input.roleId !== ownerRole.id ? ownerRole.id : ownerRole.id,
          status: "ACTIVE",
        },
        update: {
          role_id: ownerRole.id,
          status: "ACTIVE",
          ...(input.name ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
        },
        select: { id: true, name: true, clerk_user_id: true },
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

    return NextResponse.json({
      owner: {
        id: result.owner.id,
        name: result.owner.name,
        clerkUserId: result.owner.clerk_user_id,
      },
      demoted: result.demoted,
    });
  },
);
