import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const organizationsTable = pgTable("dunda_organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  domain: text("domain"),
  currency: text("currency").notNull().default("KES"),
  taxRate: integer("tax_rate").notNull().default(16),
  serviceChargeRate: integer("service_charge_rate").notNull().default(10),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const branchesTable = pgTable("dunda_branches", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  city: text("city").notNull(),
  address: text("address"),
  status: text("status").notNull().default("LIVE"),
  timezone: text("timezone").notNull().default("Africa/Nairobi"),
  phone: text("phone"),
  email: text("email"),
  activeTables: integer("active_tables").notNull().default(0),
  totalTables: integer("total_tables").notNull().default(0),
  revenueToday: integer("revenue_today").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const floorsTable = pgTable("dunda_floors", {
  id: text("id").primaryKey(),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const floorSectionsTable = pgTable("dunda_floor_sections", {
  id: text("id").primaryKey(),
  floorId: text("floor_id")
    .notNull()
    .references(() => floorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#f07a4b"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable);
export const insertBranchSchema = createInsertSchema(branchesTable);
export const insertFloorSchema = createInsertSchema(floorsTable);
export const insertFloorSectionSchema = createInsertSchema(floorSectionsTable);

export type Organization = typeof organizationsTable.$inferSelect;
export type Branch = typeof branchesTable.$inferSelect;
export type Floor = typeof floorsTable.$inferSelect;
export type FloorSection = typeof floorSectionsTable.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type InsertFloor = z.infer<typeof insertFloorSchema>;
export type InsertFloorSection = z.infer<typeof insertFloorSectionSchema>;
