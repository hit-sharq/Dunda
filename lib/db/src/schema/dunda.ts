import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const branchesTable = pgTable("dunda_branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  status: text("status").notNull().default("LIVE"),
  activeTables: integer("active_tables").notNull().default(0),
  totalTables: integer("total_tables").notNull().default(0),
  revenueToday: integer("revenue_today").notNull().default(0),
});

export const tablesTable = pgTable("dunda_tables", {
  id: text("id").primaryKey(),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id),
  name: text("name").notNull(),
  section: text("section").notNull(),
  seats: integer("seats").notNull(),
  status: text("status").notNull().default("AVAILABLE"),
  total: integer("total").notNull().default(0),
  tabId: text("tab_id"),
  customer: text("customer"),
});

export const productsTable = pgTable("dunda_products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: text("category_id").notNull(),
  category: text("category").notNull(),
  price: integer("price").notNull(),
  unit: text("unit").notNull(),
  stock: numeric("stock", { precision: 12, scale: 2 }).notNull().default("0"),
  available: text("available").notNull().default("true"),
  accent: text("accent").notNull().default("amber"),
});

export const tabsTable = pgTable("dunda_tabs", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  customer: text("customer").notNull(),
  tableName: text("table_name").notNull(),
  status: text("status").notNull().default("OPEN"),
  subtotal: integer("subtotal").notNull().default(0),
  serviceCharge: integer("service_charge").notNull().default(0),
  tax: integer("tax").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  total: integer("total").notNull().default(0),
  openedAt: timestamp("opened_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const tabItemsTable = pgTable("dunda_tab_items", {
  id: text("id").primaryKey(),
  tabId: text("tab_id")
    .notNull()
    .references(() => tabsTable.id),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  total: integer("total").notNull(),
  category: text("category").notNull(),
});

export const ordersTable = pgTable("dunda_orders", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  tableName: text("table_name").notNull(),
  status: text("status").notNull().default("NEW"),
  items: text("items").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reservationsTable = pgTable("dunda_reservations", {
  id: text("id").primaryKey(),
  customer: text("customer").notNull(),
  phone: text("phone").notNull(),
  reservationDate: date("reservation_date", { mode: "string" }).notNull(),
  time: text("time").notNull(),
  tableName: text("table_name").notNull(),
  guests: integer("guests").notNull(),
  status: text("status").notNull().default("PENDING"),
  notes: text("notes"),
});

export const inventoryAlertsTable = pgTable("dunda_inventory_alerts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  stock: numeric("stock", { precision: 12, scale: 2 }).notNull(),
  minimum: numeric("minimum", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  severity: text("severity").notNull().default("LOW"),
});

export const activityTable = pgTable("dunda_activity", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  amount: integer("amount"),
  timestamp: timestamp("timestamp", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertBranchSchema = createInsertSchema(branchesTable);
export const insertTableSchema = createInsertSchema(tablesTable);
export const insertProductSchema = createInsertSchema(productsTable);
export const insertTabSchema = createInsertSchema(tabsTable);
export const insertTabItemSchema = createInsertSchema(tabItemsTable);
export const insertOrderSchema = createInsertSchema(ordersTable);
export const insertReservationSchema = createInsertSchema(reservationsTable);
export const insertInventoryAlertSchema =
  createInsertSchema(inventoryAlertsTable);
export const insertActivitySchema = createInsertSchema(activityTable);

export type Branch = typeof branchesTable.$inferSelect;
export type VenueTable = typeof tablesTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
export type Tab = typeof tabsTable.$inferSelect;
export type TabItem = typeof tabItemsTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
export type Reservation = typeof reservationsTable.$inferSelect;
export type InventoryAlert = typeof inventoryAlertsTable.$inferSelect;
export type ActivityItem = typeof activityTable.$inferSelect;
export type InsertBranch = z.infer<typeof insertBranchSchema>;