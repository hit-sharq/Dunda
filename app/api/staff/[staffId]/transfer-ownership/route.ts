import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Hands a club over to one of its staff members. The staff member becomes
 * the owner and the current owner steps down to General Manager, so there is
 * always exactly one owner.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ staffId: string }> }) => {
    checkRateLimit(clientIpKey(request), 10, 60 * 60 * 1000);

    const session = await requirePermission("manage_staff");
    const organizationId = session.organizationId as string;
    const { staffId } = await context.params;

    const target = await prisma.dunda_staff.findFirst({
      where: orgWhere(organizationId, { id: staffId }),
      select: { id: true, name: true, email: true, role_id: true, status: true },
    });
    if (!target) throw notFound("That staff member");

    if (target.status !== "ACTIVE") {
      throw wrongState("That staff member is not active.");
    }

    const ownerRole = await prisma.dunda_roles.findFirst({
      where: { is_owner: true },
      select: { id: true, name: true },
    });
    if (!ownerRole) {
      return NextResponse.json(
        { error: "This installation has no owner role configured.", code: "NOT_CONFIGURED" },
        { status: 422 },
      );
    }

    const generalManager = await prisma.dunda_roles.findFirst({
      where: { name: { equals: "General Manager" } },
      select: { id: true },
    });

    const previousOwner = await prisma.dunda_staff.findFirst({
      where: { organization_id: organizationId, role_id: ownerRole.id },
      select: { id: true, name: true },
    });

    if (previousOwner && previousOwner.id === target.id) {
      throw wrongState("That staff member already owns this club.");
    }

    await prisma.$transaction(async (tx) => {
      if (previousOwner && generalManager) {
        await tx.dunda_staff.update({
          where: { id: previousOwner.id },
          data: { role_id: generalManager.id },
        });
      }

      await tx.dunda_staff.update({
        where: { id: target.id },
        data: { role_id: ownerRole.id, status: "ACTIVE" },
      });

      await tx.dunda_audit_logs.create({
        data: {
          organization_id: organizationId,
          staff_id: session.staffId,
          action: "TRANSFER_OWNERSHIP",
          entity: "organization",
          entity_id: organizationId,
          detail: `Ownership transferred to ${target.name}`,
          previous_value: previousOwner
            ? { owner: previousOwner.name, ownerId: previousOwner.id }
            : undefined,
          new_value: { owner: target.name, ownerId: target.id },
        },
      });
    });

    return NextResponse.json({
      id: target.id,
      name: target.name,
      owner: { id: target.id, name: target.name },
      demoted: previousOwner
        ? { id: previousOwner.id, name: previousOwner.name }
        : null,
    });
  },
);
