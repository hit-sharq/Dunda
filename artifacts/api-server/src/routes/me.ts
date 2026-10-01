import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  branchesTable,
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  staffTable,
} from "@workspace/db";
import { getTenantSettings } from "../lib/tenantSettings";
import { isPlatformAdmin } from "../middlewares/platformAdmin";
import type { StaffContext } from "../lib/permissions";

const router: IRouter = Router();

/**
 * The caller's own identity, role and resolved permissions. Clients use this to
 * decide what to render; the server still enforces every check independently.
 */
router.get("/", async (req, res): Promise<void> => {
  // Deliberately independent of tenantMiddleware. An operator may own no club,
  // and this endpoint is how the app learns they are still one.
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const staff = (
    await db.select().from(staffTable).where(eq(staffTable.clerkUserId, userId))
  )[0];
  const tenant = staff
    ? {
        organizationId: staff.organizationId,
        branchId: staff.branchId ?? null,
        staffId: staff.id,
        clerkUserId: userId,
      }
    : {
        organizationId: "",
        branchId: null,
        staffId: null,
        clerkUserId: userId,
      };

  if (!staff) {
    const [org] = tenant.organizationId
      ? await db
          .select()
          .from(branchesTable)
          .where(eq(branchesTable.organizationId, tenant.organizationId))
          .limit(1)
      : [undefined];
    // An operator may own no club at all, and still need to reach the console to
    // provision one, so the flag is set on this path too.
    res.json({
      ...(isPlatformAdmin(userId) ? { operator: true } : {}),
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

  const [role] = staff
    ? await db.select().from(rolesTable).where(eq(rolesTable.id, staff.roleId))
    : [undefined];

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

  const operator = isPlatformAdmin(userId);

  res.json({
    ...(operator ? { operator: true } : {}),
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
    roleId: staff?.roleId ?? null,
    permissions: permissionRows.map((p) => p.name),
    isOwner: role?.isOwner ?? false,
    settings: await getTenantSettings(tenant.organizationId),
    roles: (
      await db
        .select({ id: rolesTable.id, name: rolesTable.name, isOwner: rolesTable.isOwner })
        .from(rolesTable)
        .orderBy(rolesTable.sortOrder)
    ).map((r) => ({
      id: r.id,
      name: r.name,
      // Only an owner may hand out the owner role, and only while nobody holds it.
      grantable: !r.isOwner || (role?.isOwner ?? false),
    })),
    canGrantStaff: (role?.isOwner ?? false) || permissionRows.some((p) => p.name === "manage_staff"),
  });
});

export default router;
