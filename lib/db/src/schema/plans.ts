import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

/**
 * The plan catalogue.
 *
 * A subscription row carries only the plan's name, so there was nowhere to
 * change what a club pays and every club's terms were a string nobody could
 * edit. The limits are the pricing: a club on a one-branch plan that opens a
 * second one has to move up, and that is what branchLimit and userLimit express.
 *
 * Renamed from the original dunda_plans, which read as "plan details" rather
 * than something a subscription actually points at.
 */
export const plansTable = pgTable("dunda_plans", {
  id: text("id").primaryKey(),
  /** Stable key used by subscriptions and by the club app to gate modules. */
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  /** Whole units of the currency. A price of 0 means the tier is free. */
  monthlyPrice: integer("monthly_price").notNull().default(0),
  annualPrice: integer("annual_price").notNull().default(0),
  branchLimit: integer("branch_limit").notNull().default(1),
  userLimit: integer("user_limit").notNull().default(5),
  /** Module keys this tier unlocks, e.g. pool, events, analytics. */
  modules: jsonb("modules").$type<string[]>().notNull().default([]),
  /** An Enterprise-style tier priced per agreement rather than from the catalogue. */
  isCustom: boolean("is_custom").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Plan = typeof plansTable.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export const insertPlanSchema = createInsertSchema(plansTable);