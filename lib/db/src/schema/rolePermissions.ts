import { createInsertSchema } from "drizzle-zod";
import { pgTable, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { rolesTable } from "./auth";
import { permissionsTable } from "./permissions";

export const rolePermissionsTable = pgTable("dunda_role_permissions", {
  id: text("id").primaryKey(),
  roleId: text("role_id")
    .notNull()
    .references(() => rolesTable.id, { onDelete: "cascade" }),
  permissionId: text("permission_id")
    .notNull()
    .references(() => permissionsTable.id, { onDelete: "cascade" }),
});

export type RolePermission = typeof rolePermissionsTable.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export const insertRolePermissionSchema = createInsertSchema(rolePermissionsTable);