import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  route,
  resolveSession,
  parseBody,
  Forbidden,
  NotProvisioned,
} from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const addRolePermissionSchema = z.object({
  permissionId: z.string().min(1, "A permission id is required."),
});

export const GET = route(
  async (request: Request, context: { params: Promise<{ roleId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { roleId } = await context.params;

    const permissions = await prisma.dunda_role_permissions.findMany({
      where: { role_id: roleId },
      select: {
        id: true,
        permission_id: true,
        dunda_permissions: { select: { id: true, name: true, description: true, category: true } },
      },
      orderBy: { dunda_permissions: { name: "asc" } },
    });

    return NextResponse.json(
      permissions.map((rp) => ({
        id: rp.id,
        permissionId: rp.permission_id,
        name: rp.dunda_permissions.name,
        description: rp.dunda_permissions.description,
        category: rp.dunda_permissions.category,
      })),
    );
  },
);

export const POST = route(
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

    const input = await parseBody(addRolePermissionSchema, request);

    const permission = await prisma.dunda_permissions.findUnique({
      where: { id: input.permissionId },
      select: { id: true, name: true },
    });
    if (!permission) {
      return NextResponse.json(
        { error: "That permission no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const existing = await prisma.dunda_role_permissions.findFirst({
      where: { role_id: roleId, permission_id: input.permissionId },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "That permission is already assigned to this role.",
          code: "DUPLICATE_PERMISSION",
        },
        { status: 409 },
      );
    }

    const link = await prisma.dunda_role_permissions.create({
      data: {
        role_id: roleId,
        permission_id: input.permissionId,
      },
      select: { id: true, role_id: true, permission_id: true },
    });

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: session.organizationId ?? null,
        actor_clerk_user_id: session.clerkUserId,
        action: "CREATE",
        entity: "role_permission",
        entity_id: link.id,
        detail: `Added ${permission.name} to role ${role.name}`,
        new_value: { roleId, permissionId: input.permissionId },
      },
    });

    return NextResponse.json(
      { id: link.id, roleId: link.role_id, permissionId: link.permission_id },
      { status: 201 },
    );
  },
);

export const DELETE = route(
  async (request: Request, context: { params: Promise<{ roleId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { roleId } = await context.params;

    const url = new URL(request.url);
    const permissionId = url.searchParams.get("permissionId");
    if (!permissionId) {
      return NextResponse.json(
        { error: "Which permission?", code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    const link = await prisma.dunda_role_permissions.findFirst({
      where: { role_id: roleId, permission_id: permissionId },
      select: { id: true, permission_id: true },
    });
    if (!link) {
      return NextResponse.json(
        { error: "That permission is not assigned to this role.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    await prisma.dunda_role_permissions.delete({ where: { id: link.id } });

    await prisma.dunda_platform_audit_logs.create({
      data: {
        organization_id: session.organizationId ?? null,
        actor_clerk_user_id: session.clerkUserId,
        action: "REMOVE",
        entity: "role_permission",
        entity_id: link.id,
        detail: `Removed permission ${link.permission_id} from role ${roleId}`,
        previous_value: { roleId, permissionId },
      },
    });

    return NextResponse.json({ id: link.id, status: "REMOVED" });
  },
);
