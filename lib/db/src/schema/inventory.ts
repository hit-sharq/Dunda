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

export const stockMovementTypeEnum = pgEnum("dunda_stock_movement_type", [
  "PURCHASE",
  "SALE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "ADJUSTMENT",
  "WASTE",
  "RETURN",
  "STOCK_COUNT",
]);

export const inventoryItemsTable = pgTable("dunda_inventory_items", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => productsTable.id),
  name: text("name").notNull(),
  category: text("category"),
  sku: text("sku"),
  unit: text("unit").notNull().default("piece"),
  currentQuantity: numeric("current_quantity", {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default("0"),
  reorderLevel: numeric("reorder_level", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  cost: integer("cost").notNull().default(0),
  supplierId: text("supplier_id"),
});

export const suppliersTable = pgTable("dunda_suppliers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contact: text("contact"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stockMovementsTable = pgTable("dunda_stock_movements", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id),
  type: text("type").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
  quantityInBaseUnit: numeric("quantity_in_base_unit", {
    precision: 12,
    scale: 4,
  }).notNull(),
  unitId: text("unit_id"),
  referenceId: text("reference_id"),
  reason: text("reason"),
  staffId: text("staff_id").references(() => staffTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stockTransfersTable = pgTable("dunda_stock_transfers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  sourceBranchId: text("source_branch_id")
    .notNull()
    .references(() => branchesTable.id),
  destinationBranchId: text("destination_branch_id")
    .notNull()
    .references(() => branchesTable.id),
  status: text("status").notNull().default("DRAFT"),
  notes: text("notes"),
  approvedById: text("approved_by_id").references(() => staffTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stockTransferItemsTable = pgTable("dunda_stock_transfer_items", {
  id: text("id").primaryKey(),
  transferId: text("transfer_id")
    .notNull()
    .references(() => stockTransfersTable.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id),
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
  quantityInBaseUnit: numeric("quantity_in_base_unit", {
    precision: 12,
    scale: 4,
  }).notNull(),
});

export const stockCountsTable = pgTable("dunda_stock_counts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("DRAFT"),
  notes: text("notes"),
  countedById: text("counted_by_id").references(() => staffTable.id),
  approvedById: text("approved_by_id").references(() => staffTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stockCountItemsTable = pgTable("dunda_stock_count_items", {
  id: text("id").primaryKey(),
  stockCountId: text("stock_count_id")
    .notNull()
    .references(() => stockCountsTable.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id),
  expectedQuantity: numeric("expected_quantity", {
    precision: 12,
    scale: 2,
  }).notNull(),
  actualQuantity: numeric("actual_quantity", {
    precision: 12,
    scale: 2,
  }),
  variance: numeric("variance", { precision: 12, scale: 2 }),
});

export const inventoryAlertsTable = pgTable("dunda_inventory_alerts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  branchId: text("branch_id")
    .notNull()
    .references(() => branchesTable.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  stock: numeric("stock", { precision: 12, scale: 2 }).notNull(),
  minimum: numeric("minimum", { precision: 12, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  severity: text("severity").notNull().default("LOW"),
});

export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
export type Supplier = typeof suppliersTable.$inferSelect;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
export type StockTransfer = typeof stockTransfersTable.$inferSelect;
export type StockTransferItem = typeof stockTransferItemsTable.$inferSelect;
export type StockCount = typeof stockCountsTable.$inferSelect;
export type StockCountItem = typeof stockCountItemsTable.$inferSelect;
export type InventoryAlert = typeof inventoryAlertsTable.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type InsertStockTransfer = z.infer<typeof insertStockTransferSchema>;
export type InsertStockTransferItem = z.infer<
  typeof insertStockTransferItemSchema
>;
export type InsertStockCount = z.infer<typeof insertStockCountSchema>;
export type InsertStockCountItem = z.infer<typeof insertStockCountItemSchema>;
export type InsertInventoryAlert = z.infer<typeof insertInventoryAlertSchema>;

export const insertInventoryItemSchema = createInsertSchema(inventoryItemsTable);
export const insertSupplierSchema = createInsertSchema(suppliersTable);
export const insertStockMovementSchema = createInsertSchema(stockMovementsTable);
export const insertStockTransferSchema = createInsertSchema(stockTransfersTable);
export const insertStockTransferItemSchema = createInsertSchema(
  stockTransferItemsTable,
);
export const insertStockCountSchema = createInsertSchema(stockCountsTable);
export const insertStockCountItemSchema = createInsertSchema(stockCountItemsTable);
export const insertInventoryAlertSchema = createInsertSchema(
  inventoryAlertsTable,
);
