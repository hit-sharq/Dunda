import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  branchesTable,
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  staffTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import type { StaffContext } from "../lib/permissions";

const router: IRouter = Router();

/**
 * The caller's own identity, role and resolved permissions. Clients use this to
 * decide what to render; the server still enforces every check independently.
 */
router.get("/me", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const ctx = req.clerk.__staffContext as StaffContext | undefined;

  if (!ctx?.staffId) {
    const [org] = await db
      .select()
      .from(branchesTable)
      .where(eq(branchesTable.organizationId, tenant.organizationId))
      .limit(1);
    res.json({
      organizationId: tenant.organizationId,
      clerkUserId: tenant.clerkUserId,
      staff: null,
      branchId: tenant.branchId ?? org?.id ?? null,
      role: null,
      permissions: [],
      isOwner: false,
    });
    return;
  }

  const [staff] = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.id, ctx.staffId));

  const [role] = staff
    ? await db.select().from(rolesTable).where(eq(rolesTable.id, staff.roleId))
    : [null];

  const permissionRows = staff
    ? await db
        .select({ name: permissionsTable.name })
        .from(rolePermissionsTable)
        .innerJoin(
          permissionsTable,
          eq(rolePermissionsTable.permissionId, permissionsTable.id),
        )
        .where(eq(rolePermissionsTable.roleId, staff.roleId))
    : [];

  const branches = await db
    .select({
      id: branchesTable.id,
      name: branchesTable.name,
      city: branchesTable.city,
      status: branchesTable.status,
    })
    .from(branchesTable)
    .where(eq(branchesTable.organizationId, tenant.organizationId))
    .orderBy(branchesTable.name);

  res.json({
    organizationId: tenant.organizationId,
    clerkUserId: tenant.clerkUserId,
    staff: staff
      ? {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          roleId: staff.roleId,
          branchId: staff.branchId,
          status: staff.status,
        }
      : null,
    branchId: tenant.branchId,
    branches,
    role: role?.name ?? null,
    permissions: permissionRows.map((p) => p.name),
    isOwner: ctx.isOwner,
  });
});

export default router;
