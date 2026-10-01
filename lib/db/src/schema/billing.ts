import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationsTable } from "./organization";
import { plansTable } from "./plans";

/**
 * Dunda subscription billing.
 *
 * This is the money a club pays Dunda, and it is deliberately a separate set of
 * tables from dunda_payments, which records money a customer pays a club at the
 * till. Keeping them apart means subscription revenue can never be added to a
 * club's sales figures by accident, which is the mistake that turns a club's
 * books into something their own auditor cannot read.
 */

// ===========================================================================
// Subscriptions
// ===========================================================================

export const subscriptionsTable = pgTable(
  "dunda_subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    planId: text("plan_id").references(() => plansTable.id, { onDelete: "set null" }),
    plan: text("plan").notNull().default("STARTER"),
    billingCycle: text("billing_cycle").notNull().default("MONTHLY"),

    /** What the club was actually quoted. Copied from the plan, never read live. */
    amount: integer("amount").notNull().default(0),
    currency: text("currency").notNull().default("KES"),

    status: text("status").notNull().default("TRIAL"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    /** When the club can renew. Renewal is manual in the first version. */
    renewsAt: timestamp("renews_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    branchLimit: integer("branch_limit").notNull().default(1),
    userLimit: integer("user_limit").notNull().default(5),
    currentBranches: integer("current_branches").notNull().default(0),
    currentUsers: integer("current_users").notNull().default(0),

    /** How many times a renewal has failed in a row, for the dunning decision. */
    failedPaymentCount: integer("failed_payment_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("dunda_subscriptions_org").on(t.organizationId)],
);

export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable);

// ===========================================================================
// Payments a club makes to Dunda
// ===========================================================================

export const billingPaymentsTable = pgTable(
  "dunda_billing_payments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptionsTable.id, { onDelete: "cascade" }),

    /** What this payment is for: the first term, or a renewal. */
    kind: text("kind").notNull().default("SUBSCRIPTION"),
    status: text("status").notNull().default("INITIATED"),

    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("KES"),

    provider: text("provider").notNull().default("PESAPAL"),
    /** The gateway's own reference, which we send when we reconcile. */
    providerReference: text("provider_reference"),
    /** The gateway's transaction id, the only proof a payment really happened. */
    providerTransactionId: text("provider_transaction_id"),
    /** When the gateway says the money cleared. Null until verified. */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAmount: integer("refunded_amount").notNull().default(0),

    failureReason: text("failure_reason"),
    /** Raw gateway payload, kept so a dispute can be settled later. */
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("dunda_billing_payments_org").on(t.organizationId),
    // One gateway transaction can only ever be recorded once. This is the
    // guard that stops a retried webhook paying the same invoice twice.
    uniqueIndex("dunda_billing_payments_txn").on(t.provider, t.providerTransactionId),
  ],
);

export type BillingPayment = typeof billingPaymentsTable.$inferSelect;
export type InsertBillingPayment = z.infer<typeof insertBillingPaymentSchema>;
export const insertBillingPaymentSchema = createInsertSchema(billingPaymentsTable);

// ===========================================================================
// Invoices
// ===========================================================================

export const invoicesTable = pgTable(
  "dunda_invoices",
  {
    id: text("id").primaryKey(),
    /**
     * Sequential per organization. Kenyan tax practice expects a visible,
     * unbroken invoice sequence, so the number is assigned when the invoice is
     * issued and never rewritten.
     */
    number: text("number").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptionsTable.id, { onDelete: "cascade" }),
    billingPaymentId: text("billing_payment_id").references(() => billingPaymentsTable.id, {
      onDelete: "set null",
    }),

    amount: integer("amount").notNull(),
    taxAmount: integer("tax_amount").notNull().default(0),
    total: integer("total").notNull(),
    currency: text("currency").notNull().default("KES"),

    /** ISSUED or VOID. A paid invoice is never voided; it is refunded. */
    status: text("status").notNull().default("ISSUED"),
    /** DUNDA-0001 and so on, per organization. */
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("dunda_invoices_org_number").on(t.organizationId, t.number)],
);

export type Invoice = typeof invoicesTable.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export const insertInvoiceSchema = createInsertSchema(invoicesTable);

// ===========================================================================
// Gateway notifications
// ===========================================================================

/**
 * Every notification the gateway sends, kept whether or not it changed
 * anything.
 *
 * Gateways retry, so the same notification arrives more than once. Recording
 * each one and treating a repeat as a no-op is what makes handling idempotent
 * rather than hoping the gateway behaves.
 */
export const paymentNotificationsTable = pgTable(
  "dunda_payment_notifications",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    /** The gateway's notification identifier, used to spot a repeat. */
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type"),
    /** Which payment this was matched to, once matched. */
    billingPaymentId: text("billing_payment_id").references(() => billingPaymentsTable.id, {
      onDelete: "set null",
    }),

    payload: jsonb("payload").$type<Record<string, unknown>>(),
    /** ACCEPTED when it changed something, DUPLICATE when it had already been seen. */
    outcome: text("outcome").notNull().default("ACCEPTED"),
    error: text("error"),

    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("dunda_payment_notifications_event").on(t.provider, t.providerEventId)],
);

export type PaymentNotification = typeof paymentNotificationsTable.$inferSelect;
export type InsertPaymentNotification = z.infer<
  typeof insertPaymentNotificationSchema
>;
export const insertPaymentNotificationSchema =
  createInsertSchema(paymentNotificationsTable);