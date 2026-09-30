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
import { customersTable } from "./customers";

export const eventStatusEnum = pgEnum("dunda_event_status", [
  "DRAFT",
  "UPCOMING",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
]);

export const reservationStatusEnum = pgEnum("dunda_reservation_status", [
  "PENDING",
  "CONFIRMED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const eventsTable = pgTable("dunda_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  capacity: integer("capacity").notNull().default(0),
  status: text("status").notNull().default("DRAFT"),
  revenue: integer("revenue").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const eventReservationsTable = pgTable("dunda_event_reservations", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => eventsTable.id, { onDelete: "cascade" }),
  customerId: text("customer_id")
    .notNull()
    .references(() => customersTable.id),
  guests: integer("guests").notNull().default(1),
  vipPackageId: text("vip_package_id"),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const vipPackagesTable = pgTable("dunda_vip_packages", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  minimumSpend: integer("minimum_spend").notNull().default(0),
  guestCount: integer("guest_count").notNull().default(1),
  tableId: text("table_id"),
  status: text("status").notNull().default("AVAILABLE"),
});

export const reservationsTable = pgTable("dunda_reservations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id),
  customerId: text("customer_id").references(() => customersTable.id),
  customer: text("customer").notNull(),
  phone: text("phone").notNull(),
  reservationDate: text("reservation_date").notNull(),
  time: text("time").notNull(),
  tableName: text("table_name").notNull(),
  guests: integer("guests").notNull(),
  status: text("status").notNull().default("PENDING"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const shiftStatuses = ["DRAFT", "RUNNING", "CLOSED"] as const;

export const staffShiftsTable = pgTable("dunda_staff_shifts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id),
  staffId: text("staff_id")
    .notNull()
    .references(() => staffTable.id),
  clockInAt: timestamp("clock_in_at", { withTimezone: true }),
  clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
  breakStartAt: timestamp("break_start_at", { withTimezone: true }),
  breakEndAt: timestamp("break_end_at", { withTimezone: true }),
  status: text("status").notNull().default("DRAFT"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Event = typeof eventsTable.$inferSelect;
export type EventReservation = typeof eventReservationsTable.$inferSelect;
export type VipPackage = typeof vipPackagesTable.$inferSelect;
export type Reservation = typeof reservationsTable.$inferSelect;
export type StaffShift = typeof staffShiftsTable.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type InsertEventReservation = z.infer<typeof insertEventReservationSchema>;
export type InsertVipPackage = z.infer<typeof insertVipPackageSchema>;
export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type InsertStaffShift = z.infer<typeof insertStaffShiftSchema>;

export const insertEventSchema = createInsertSchema(eventsTable);
export const insertEventReservationSchema = createInsertSchema(
  eventReservationsTable,
);
export const insertVipPackageSchema = createInsertSchema(vipPackagesTable);
export const insertReservationSchema = createInsertSchema(reservationsTable);
export const insertStaffShiftSchema = createInsertSchema(staffShiftsTable);
