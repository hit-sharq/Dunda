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
import { ordersTable } from "./orders";
import { staffTable } from "./auth";

export const paymentMethodEnum = pgEnum("dunda_payment_method", [
  "CASH",
  "MPESA",
  "CARD",
  "BANK_TRANSFER",
  "OTHER",
]);

export const paymentStatusEnum = pgEnum("dunda_payment_status", [
  "PENDING",
  "SUCCESSFUL",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);

export const paymentsTable = pgTable("dunda_payments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id),
  orderId: text("order_id")
    .notNull()
    .references(() => ordersTable.id),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  reference: text("reference"),
  status: text("status").notNull().default("SUCCESSFUL"),
  cashierId: text("cashier_id").references(() => staffTable.id),
  paidAt: timestamp("paid_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const refundsTable = pgTable("dunda_refunds", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id),
  paymentId: text("payment_id")
    .notNull()
    .references(() => paymentsTable.id),
  amount: integer("amount").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("PENDING"),
  approvedById: text("approved_by_id").references(() => staffTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Payment = typeof paymentsTable.$inferSelect;
export type Refund = typeof refundsTable.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type InsertRefund = z.infer<typeof insertRefundSchema>;

export const insertPaymentSchema = createInsertSchema(paymentsTable);
export const insertRefundSchema = createInsertSchema(refundsTable);
