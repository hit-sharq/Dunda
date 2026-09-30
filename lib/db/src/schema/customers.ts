import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationsTable, branchesTable } from "./organization";
import { staffTable } from "./auth";

export const customerVipLevelEnum = pgEnum("dunda_customer_vip_level", [
  "NONE",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
]);

export const customersTable = pgTable("dunda_customers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id").references(() => branchesTable.id),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  vipLevel: text("vip_level").notNull().default("NONE"),
  totalVisits: integer("total_visits").notNull().default(0),
  totalSpend: integer("total_spend").notNull().default(0),
  lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Customer = typeof customersTable.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export const insertCustomerSchema = createInsertSchema(customersTable);
