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

export const notificationTypeEnum = pgEnum("dunda_notification_type", [
  "ORDER_READY",
  "RESERVATION",
  "LOW_STOCK",
  "INVENTORY_DISCREPANCY",
  "APPROVAL_REQUEST",
  "STOCK_TRANSFER",
  "EVENT_REMINDER",
]);

export const auditActionEnum = pgEnum("dunda_audit_action", [
  "LOGIN",
  "CREATE",
  "UPDATE",
  "DELETE",
  "VOID",
  "REFUND",
  "ADJUST",
  "APPROVE",
  "DISCARD",
]);

export const auditLogsTable = pgTable("dunda_audit_logs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id").references(() => branchesTable.id),
  staffId: text("staff_id").references(() => staffTable.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detail: text("detail"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notificationsTable = pgTable("dunda_notifications", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id").references(() => branchesTable.id),
  staffId: text("staff_id")
    .notNull()
    .references(() => staffTable.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: text("read").notNull().default("false"),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const activityTable = pgTable("dunda_activity", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id").references(() => branchesTable.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  amount: integer("amount"),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptionsTable = pgTable("dunda_subscriptions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("STARTER"),
  status: text("status").notNull().default("ACTIVE"),
  billingCycle: text("billing_cycle").notNull().default("MONTHLY"),
  branchLimit: integer("branch_limit").notNull().default(1),
  userLimit: integer("user_limit").notNull().default(5),
  currentBranches: integer("current_branches").notNull().default(0),
  currentUsers: integer("current_users").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  renewsAt: timestamp("renews_at", { withTimezone: true }),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
export type ActivityItem = typeof activityTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export const insertAuditLogSchema = createInsertSchema(auditLogsTable);
export const insertNotificationSchema = createInsertSchema(notificationsTable);
export const insertActivitySchema = createInsertSchema(activityTable);
export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable);
