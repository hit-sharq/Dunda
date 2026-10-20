import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  route,
  requirePermission,
  resolveSession,
  parseBody,
  Forbidden,
  NotProvisioned,
} from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const updateRoleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const GET = route(
  async (request: Request, context: { params: Promise<{ roleId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { roleId } = await context.params;

    const role = await prisma.dunda_roles.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        name: true,
        description: true,
        is_owner: true,
        sort_order: true,
        dunda_role_permissions: {
          select: { permission_id: true, dunda_permissions: { select: { name: true } } },
        },
        _count: { select: { dunda_staff: true } },
      },
    });
    if (!role) {
      return NextResponse.json(
        { error: "That role no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: role.id,
      name: role.name,
      description: role.description,
      isOwner: role.is_owner,
      sortOrder: role.sort_order,
      staffCount: role._count.dunda_staff,
      permissions: role.dunda_role_permissions.map((rp) => ({
        id: rp.permission_id,
        name: rp.dunda_permissions.name,
      })),
    });
  },
);

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ roleId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { roleId } = await context.params;

    const role = await prisma.dunda_roles.findUnique({
      where: { id: roleId },
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
        { error: "The owner role cannot be edited.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const input = await parseBody(updateRoleSchema, request);

    const updated = await prisma.dunda_roles.update({
      where: { id: roleId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      },
      select: { id: true, name: true, description: true, sort_order: true },
    });

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: session.organizationId ?? null,
        actor_clerk_user_id: session.clerkUserId,
        action: "UPDATE",
        entity: "role",
        entity_id: roleId,
        detail: `Updated role ${role.name}`,
        new_value: { name: updated.name, description: updated.description, sortOrder: updated.sort_order },
      },
    });

    return NextResponse.json(updated);
  },
);

export const DELETE = route(
  async (request: Request, context: { params: Promise<{ roleId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { roleId } = await context.params;

    const role = await prisma.dunda_roles.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, is_owner: true, _count: { select: { dunda_staff: true } } },
    });
    if (!role) {
      return NextResponse.json(
        { error: "That role no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (role.is_owner) {
      return NextResponse.json(
        { error: "The owner role cannot be deleted.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    if (role._count.dunda_staff > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete role ${role.name}: ${role._count.dunda_staff} staff member(s) still have this role.`,
          code: "ROLE_IN_USE",
        },
        { status: 422 },
      );
    }

    await prisma.dunda_roles.delete({ where: { id: roleId } });

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: session.organizationId ?? null,
        actor_clerk_user_id: session.clerkUserId,
        action: "DELETE",
        entity: "role",
        entity_id: roleId,
        detail: `Deleted role ${role.name}`,
        previous_value: { name: role.name },
      },
    });

    return NextResponse.json({ id: roleId, status: "DELETED" });
  },
);
