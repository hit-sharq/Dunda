import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationsTable, branchesTable } from "./organization";
import { productsTable } from "./products";
import { staffTable } from "./auth";
import { customersTable } from "./customers";
import { tablesTable } from "./tables";

export const orderStatusEnum = pgEnum("dunda_order_status", [
  "DRAFT",
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "SERVED",
  "PAYMENT_PENDING",
  "COMPLETED",
  "CANCELLED",
]);

export const ordersTable = pgTable("dunda_orders", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id),
  number: text("number").notNull().unique(),
  tableName: text("table_name"),
  // Foreign key to the table the order is served to. Orders occupy their table
  // for the life of the ticket, exactly as a tab does.
  tableId: text("table_id").references(() => tablesTable.id, { onDelete: "set null" }),
  customerId: text("customer_id").references(() => customersTable.id),
  staffId: text("staff_id").references(() => staffTable.id),
  status: text("status").notNull().default("DRAFT"),
  subtotal: integer("subtotal").notNull().default(0),
  serviceCharge: integer("service_charge").notNull().default(0),
  tax: integer("tax").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  total: integer("total").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orderItemsTable = pgTable("dunda_order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id),
  unitId: text("unit_id"),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  total: integer("total").notNull(),
  notes: text("notes"),
  categoryId: text("category_id"),
});

export const orderItemUnitsTable = pgTable("dunda_order_item_units", {
  id: text("id").primaryKey(),
  orderItemId: text("order_item_id")
    .notNull()
    .references(() => orderItemsTable.id, { onDelete: "cascade" }),
  unitId: text("unit_id").notNull(),
  unitName: text("unit_name").notNull(),
  conversionFactor: numeric("conversion_factor", {
    precision: 12,
    scale: 4,
  }).notNull(),
  quantityInBaseUnit: numeric("quantity_in_base_unit", {
    precision: 12,
    scale: 4,
  }).notNull(),
});

export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type OrderItemUnit = typeof orderItemUnitsTable.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type InsertOrderItemUnit = z.infer<typeof insertOrderItemUnitSchema>;

export const insertOrderSchema = createInsertSchema(ordersTable);
export const insertOrderItemSchema = createInsertSchema(orderItemsTable);
export const insertOrderItemUnitSchema = createInsertSchema(orderItemUnitsTable);
