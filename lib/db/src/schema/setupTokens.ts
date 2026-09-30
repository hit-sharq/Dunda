import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationsTable } from "./organization";

/**
 * Single-use setup tokens.
 *
 * The first owner cannot be invited, because inviting requires an owner to
 * already exist. Ownership is therefore claimed with a token that is generated
 * out of band, stored only as a hash, and consumed on first use. Signing in
 * alone never grants anything.
 *
 * "First sign-up becomes owner" was rejected: that is a race on a public
 * endpoint, and it also silently promotes any existing account when a database
 * is restored.
 */
export const setupTokensTable = pgTable("dunda_setup_tokens", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  // scrypt digest, never the token itself.
  tokenHash: text("token_hash").notNull(),
  purpose: text("purpose").notNull().default("CLAIM_OWNERSHIP"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  consumedByClerkUserId: text("consumed_by_clerk_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** A recorded attempt to redeem a token, successful or not. */
export const setupTokenAttemptsTable = pgTable("dunda_setup_token_attempts", {
  id: text("id").primaryKey(),
  tokenId: text("token_id")
    .notNull()
    .references(() => setupTokensTable.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id"),
  succeeded: boolean("succeeded").notNull().default(false),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SetupToken = typeof setupTokensTable.$inferSelect;
export type InsertSetupToken = z.infer<typeof insertSetupTokenSchema>;
export const insertSetupTokenSchema = createInsertSchema(setupTokensTable);
