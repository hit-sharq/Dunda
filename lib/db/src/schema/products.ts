import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { organizationsTable, branchesTable } from "./organization";

export const categoriesTable = pgTable("dunda_categories", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6f9fb2"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const productsTable = pgTable("dunda_products", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  categoryId: text("category_id")
    .notNull()
    .references(() => categoriesTable.id),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull().default("piece"),
  sku: text("sku"),
  barcode: text("barcode"),
  description: text("description"),
  image: text("image"),
  cost: integer("cost").notNull().default(0),
  price: integer("price").notNull(),
  tax: integer("tax").notNull().default(16),
  trackInventory: boolean("track_inventory").notNull().default(true),
  active: boolean("active").notNull().default(true),
  available: text("available").notNull().default("true"),
  stock: numeric("stock", { precision: 12, scale: 2 }).notNull().default("0"),
  baseUnit: text("base_unit").notNull().default("piece"),
  accent: text("accent").notNull().default("amber"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productUnitsTable = pgTable("dunda_product_units", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull(),
  conversionFactor: numeric("conversion_factor", { precision: 12, scale: 4 })
    .notNull()
    .default("1"),
  isBaseUnit: boolean("is_base_unit").notNull().default(false),
  sellingPrice: integer("selling_price").notNull(),
  cost: integer("cost"),
  wholeUnitsOnly: boolean("whole_units_only").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const productBarcodesTable = pgTable("dunda_product_barcodes", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  barcode: text("barcode").notNull().unique(),
  unitId: text("unit_id")
    .notNull()
    .references(() => productUnitsTable.id),
});

export const productBranchAvailabilityTable = pgTable(
  "dunda_product_branch_availability",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    branchId: text("branch_id")
      .notNull()
      .references(() => branchesTable.id, { onDelete: "cascade" }),
    price: integer("price"),
    trackInventory: boolean("track_inventory").notNull().default(true),
    available: boolean("available").notNull().default(true),
  },
);

export type Category = typeof categoriesTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
export type ProductUnit = typeof productUnitsTable.$inferSelect;
export type ProductBarcode = typeof productBarcodesTable.$inferSelect;
export type ProductBranchAvailability =
  typeof productBranchAvailabilityTable.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertProductUnit = z.infer<typeof insertProductUnitSchema>;
export type InsertProductBarcode = z.infer<typeof insertProductBarcodeSchema>;

export const insertCategorySchema = createInsertSchema(categoriesTable);
export const insertProductSchema = createInsertSchema(productsTable);
export const insertProductUnitSchema = createInsertSchema(productUnitsTable);
export const insertProductBarcodeSchema =
  createInsertSchema(productBarcodesTable);
export const insertProductBranchAvailabilitySchema = createInsertSchema(
  productBranchAvailabilityTable,
);
