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

/**
 * Changes what somebody can do.
 *
 * The sidebar is not configured per person: /me reads the role off the staff row
 * and returns that role's permissions, and the nav filters on them. So moving
 * somebody between roles is what moves their tabs, and this is where a manager
 * does that. Nothing is stored twice and nothing can drift.
 *
 * Changing the role therefore takes effect on that person's next /me — the
 * sidebar updates without a sign-out, because the session is unchanged and only
 * what it is allowed to do has moved.
 */
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

      // Ownership is transferred through the console, not handed out from a staff
      // list: there is one owner per club and it is somebody who accepted it.
      if (role.is_owner) {
        return NextResponse.json(
          { error: "The owner role is transferred, not assigned.", code: "FORBIDDEN" },
          { status: 403 },
        );
      }

      // A manager cannot promote somebody to a role that outranks them. Without
      // this, a manager could hand a colleague the general manager's permissions
      // and there would be no record of who did it beyond the audit line.
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
        // The before and after are recorded because "who could do what" is exactly
        // the question asked when an access change is questioned later.
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

/**
 * Removes somebody from the roster.
 *
 * Their history stays — orders, payments and shifts they worked are financial
 * records, not something to take with the person. What is removed is their access.
 */
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

    // Suspended rather than deleted: the person must stop being able to sign in,
    // and their shifts, orders and stock movements have to stay attributable.
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
