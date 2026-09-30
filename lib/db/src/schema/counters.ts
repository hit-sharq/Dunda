import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { branchesTable, organizationsTable } from "./organization";

/**
 * Per-branch document counters.
 *
 * Tab and order numbers are the identifiers printed on receipts, quoted on the
 * floor and stored in the audit log, so they have to be unique and increasing.
 * These are allocated by taking a row lock, which is safe on PostgreSQL for
 * this volume and keeps the number server-assigned rather than guessed.
 */
export const documentCountersTable = pgTable("dunda_document_counters", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  nextValue: integer("next_value").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DocumentCounter = typeof documentCountersTable.$inferSelect;
export type InsertDocumentCounter = z.infer<typeof insertDocumentCounterSchema>;
export const insertDocumentCounterSchema = createInsertSchema(
  documentCountersTable,
);
