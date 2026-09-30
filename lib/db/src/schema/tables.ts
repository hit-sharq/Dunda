import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationsTable, branchesTable, floorsTable } from "./organization";
import { productsTable } from "./products";

export const tablesTable = pgTable("dunda_tables", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  floorId: text("floor_id")
    .references(() => floorsTable.id, { onDelete: "cascade" }),
  floorSectionId: text("floor_section_id"),
  name: text("name").notNull(),
  section: text("section").notNull(),
  seats: integer("seats").notNull().default(4),
  status: text("status").notNull().default("AVAILABLE"),
  total: integer("total").notNull().default(0),
  tabId: text("tab_id"),
  customer: text("customer"),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  width: integer("width").notNull().default(120),
  height: integer("height").notNull().default(120),
});

export const tabsTable = pgTable("dunda_tabs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id),
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
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  tabId: text("tab_id")
    .notNull()
    .references(() => tabsTable.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  total: integer("total").notNull(),
  category: text("category").notNull(),
  unitId: text("unit_id"),
  unitName: text("unit_name"),
  notes: text("notes"),
});

export const tabItemUnitsTable = pgTable("dunda_tab_item_units", {
  id: text("id").primaryKey(),
  tabItemId: text("tab_item_id")
    .notNull()
    .references(() => tabItemsTable.id, { onDelete: "cascade" }),
  unitId: text("unit_id").notNull(),
  unitName: text("unit_name").notNull(),
  conversionFactor: integer("conversion_factor").notNull(),
  quantityInBaseUnit: integer("quantity_in_base_unit").notNull(),
});

export type VenueTable = typeof tablesTable.$inferSelect;
export type Tab = typeof tabsTable.$inferSelect;
export type TabItem = typeof tabItemsTable.$inferSelect;
export type TabItemUnit = typeof tabItemUnitsTable.$inferSelect;
export type InsertTable = z.infer<typeof insertTableSchema>;
export type InsertTab = z.infer<typeof insertTabSchema>;
export type InsertTabItem = z.infer<typeof insertTabItemSchema>;
export type InsertTabItemUnit = z.infer<typeof insertTabItemUnitSchema>;

export const insertTableSchema = createInsertSchema(tablesTable);
export const insertTabSchema = createInsertSchema(tabsTable);
export const insertTabItemSchema = createInsertSchema(tabItemsTable);
export const insertTabItemUnitSchema = createInsertSchema(tabItemUnitsTable);
