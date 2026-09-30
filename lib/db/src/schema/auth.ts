import { createInsertSchema } from "drizzle-zod";
import { uniqueIndex } from "drizzle-orm/pg-core";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationsTable, branchesTable } from "./organization";

export const rolesTable = pgTable("dunda_roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  // Owner rights are a property of the role, not of how it happens to be
  // named. Renaming a role must not silently strip owner access.
  isOwner: boolean("is_owner").notNull().default(false),
});

export const staffTable = pgTable("dunda_staff", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  // An unclaimed staff record is one the owner created but that has never been
  // linked to a signed-in account. Only these may be claimed by email match.
  clerkUserId: text("clerk_user_id").unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  roleId: text("role_id")
    .notNull()
    .references(() => rolesTable.id),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const organizationMembersTable = pgTable("dunda_organization_members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),
  roleId: text("role_id")
    .notNull()
    .references(() => rolesTable.id),
  status: text("status").notNull().default("ACTIVE"),
  joinedAt: timestamp("joined_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [uniqueIndex("dunda_org_members_org_user").on(t.organizationId, t.clerkUserId)]);

export const branchMembersTable = pgTable("dunda_branch_members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),
  roleId: text("role_id")
    .notNull()
    .references(() => rolesTable.id),
  status: text("status").notNull().default("ACTIVE"),
  joinedAt: timestamp("joined_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Role = typeof rolesTable.$inferSelect;
export type Staff = typeof staffTable.$inferSelect;
export type OrganizationMember = typeof organizationMembersTable.$inferSelect;
export type BranchMember = typeof branchMembersTable.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;
export type InsertBranchMember = z.infer<typeof insertBranchMemberSchema>;

export const insertRoleSchema = createInsertSchema(rolesTable);
export const insertStaffSchema = createInsertSchema(staffTable);
export const insertOrganizationMemberSchema = createInsertSchema(
  organizationMembersTable,
);
export const insertBranchMemberSchema = createInsertSchema(branchMembersTable);