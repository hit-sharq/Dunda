import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  route,
  requirePermission,
  orgWhere,
  assertSameOrg,
  parseBody,
} from "@/lib/server/http";
import { wrongState } from "@/lib/errors.server";

export const dynamic = "force-dynamic";


const updateStaffSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  roleId: z.string().optional(),
  branchId: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]).optional(),
});

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ staffId: string }> }) => {
    const session = await requirePermission("manage_staff");
    const organizationId = session.organizationId as string;
    const { staffId } = await context.params;

    const input = await parseBody(updateStaffSchema, request);

    const existing = await prisma.dunda_staff.findFirst({
      where: orgWhere(organizationId, { id: staffId }),
      include: { dunda_roles: { select: { name: true } } },
    });
    assertSameOrg(existing, organizationId, "That staff member");

    if (input.roleId && input.roleId !== existing.role_id) {
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

      
      
      if (role.is_owner) {
        return NextResponse.json(
          { error: "The owner role is transferred, not assigned.", code: "FORBIDDEN" },
          { status: 403 },
        );
      }

      
      
      
      const actorRole = await prisma.dunda_roles.findUnique({
        where: { id: session.roleId ?? "" },
        select: { is_owner: true },
      });
      if (actorRole && !actorRole.is_owner) {
        const target = await prisma.dunda_roles.findUnique({
          where: { id: input.roleId },
          select: { name: true },
        });
        if (target && /owner/i.test(target.name)) {
          throw wrongState("You cannot grant a role above your own.");
        }
      }
    }

    const updated = await prisma.dunda_staff.update({
      where: { id: staffId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.roleId ? { role_id: input.roleId } : {}),
        ...(input.branchId !== undefined ? { branch_id: input.branchId || null } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      include: { dunda_roles: { select: { name: true } } },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: updated.branch_id,
        staff_id: session.staffId,
        action: "UPDATE",
        entity: "staff",
        entity_id: updated.id,
        detail:
          input.roleId && input.roleId !== existing.role_id
            ? `${updated.name} moved from ${existing.dunda_roles.name} to ${updated.dunda_roles.name}`
            : `${updated.name} updated`,
        
        
        previous_value: { role: existing.dunda_roles.name, status: existing.status },
        new_value: { role: updated.dunda_roles.name, status: updated.status },
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      role: updated.dunda_roles.name,
      roleId: updated.role_id,
      branchId: updated.branch_id,
      status: updated.status,
    });
  },
);


export const DELETE = route(
  async (_request: Request, context: { params: Promise<{ staffId: string }> }) => {
    const session = await requirePermission("manage_staff");
    const organizationId = session.organizationId as string;
    const { staffId } = await context.params;

    const existing = await prisma.dunda_staff.findFirst({
      where: orgWhere(organizationId, { id: staffId }),
      include: { dunda_roles: { select: { name: true, is_owner: true } } },
    });
    assertSameOrg(existing, organizationId, "That staff member");

    if (existing.dunda_roles.is_owner) {
      return NextResponse.json(
        { error: "The owner's access cannot be removed. Transfer ownership instead.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    if (existing.id === session.staffId) {
      return NextResponse.json(
        { error: "You cannot remove your own access.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    
    
    const suspended = await prisma.dunda_staff.update({
      where: { id: staffId },
      data: { status: "SUSPENDED" },
      select: { id: true, name: true, status: true },
    });

    if (existing.clerk_user_id) {
      await prisma.dunda_organization_members.updateMany({
        where: { organization_id: organizationId, clerk_user_id: existing.clerk_user_id },
        data: { status: "SUSPENDED" },
      });
    }

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: existing.branch_id,
        staff_id: session.staffId,
        action: "SUSPEND",
        entity: "staff",
        entity_id: staffId,
        detail: `${existing.name} removed from the roster as ${existing.dunda_roles.name}`,
        previous_value: { role: existing.dunda_roles.name, status: existing.status },
        new_value: { status: "SUSPENDED" },
      },
    });

    return NextResponse.json(suspended);
  },
);