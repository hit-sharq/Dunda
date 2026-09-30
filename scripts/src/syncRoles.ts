import { db, permissionsTable, rolesTable, rolePermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ROLES, PERMISSIONS, ROLE_PERMISSIONS } from "./permissions.js";

/**
 * Brings an existing database's roles and permissions up to the current
 * catalogue, without touching staff or any operational data.
 *
 * The live database was seeded from an older revision that stored permissions
 * under display names, so nothing the code checks for actually matched. This
 * reconciles both the vocabulary and the catalogue.
 */
async function syncRolesAndPermissions(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await db
      .insert(permissionsTable)
      .values({ ...permission })
      .onConflictDoUpdate({
        target: permissionsTable.id,
        set: {
          name: permission.name,
          description: permission.description,
          category: permission.category,
        },
      });
  }

  // Retire any permission that is no longer part of the catalogue, so a stale
  // grant cannot keep granting something the code no longer asks about.
  const known = new Set(PERMISSIONS.map((p) => p.id));
  const existing = await db.select().from(permissionsTable);
  const stale = existing.filter((p) => !known.has(p.id));
  for (const permission of stale) {
    await db
      .delete(rolePermissionsTable)
      .where(eq(rolePermissionsTable.permissionId, permission.id));
    await db.delete(permissionsTable).where(eq(permissionsTable.id, permission.id));
  }

  // A database seeded from an older revision may hold a role under a different
  // id but the same display name. Match on either, and adopt the existing row
  // rather than creating a duplicate, so staff records keep pointing at a role
  // that still exists.
  const existingRoles = await db.select().from(rolesTable);
  const resolved = new Map<string, string>();

  for (const role of ROLES) {
    const match =
      existingRoles.find((r) => r.id === role.id) ??
      existingRoles.find(
        (r) => r.name.toLowerCase() === role.name.toLowerCase(),
      );

    if (match) {
      await db
        .update(rolesTable)
        .set({
          name: role.name,
          description: role.description,
          sortOrder: role.sortOrder,
          isOwner: role.isOwner,
        })
        .where(eq(rolesTable.id, match.id));
      resolved.set(role.id, match.id);
    } else {
      await db.insert(rolesTable).values({ ...role });
      resolved.set(role.id, role.id);
    }
  }

  // Rebuild the grant map from the catalogue, which is the single source of
  // truth for what each role may do.
  await db.delete(rolePermissionsTable);
  const rows = Object.entries(ROLE_PERMISSIONS).flatMap(([roleId, names]) => {
    const actualId = resolved.get(roleId);
    if (!actualId) return [];
    return names
      .filter((name) => known.has(`perm_${name}`))
      .map((name) => ({
        id: `rp-${actualId}-${name}`,
        roleId: actualId,
        permissionId: `perm_${name}`,
      }));
  });
  if (rows.length) await db.insert(rolePermissionsTable).values(rows);

  console.log(
    `Roles and permissions reconciled: ${PERMISSIONS.length} permissions, ${ROLES.length} roles, ${rows.length} grants.`,
  );
}

syncRolesAndPermissions()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Role sync failed:", err);
    process.exit(1);
  });
