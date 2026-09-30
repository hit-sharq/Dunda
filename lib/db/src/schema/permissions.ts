import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const permissionsTable = pgTable("dunda_permissions", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  category: text("category").notNull(),
});

export type Permission = typeof permissionsTable.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export const insertPermissionSchema = createInsertSchema(permissionsTable);