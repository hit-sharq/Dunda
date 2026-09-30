import { Router, type IRouter } from "express";
import { and, eq, ilike, or, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  categoriesTable,
  productsTable,
  productUnitsTable,
  productBarcodesTable,
  productBranchAvailabilityTable,
  branchesTable,
  inventoryItemsTable,
  auditLogsTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import { formatMoney, getTenantSettings } from "../lib/tenantSettings";
import { hasPermission, type StaffContext } from "../lib/permissions";
import { productAccentColors } from "../lib/constants";

const router: IRouter = Router();

function can(req: any, permission: string): boolean {
  const ctx: StaffContext | undefined = req.clerk?.__staffContext;
  if (!ctx) return false;
  return ctx.isOwner || ctx.permissions.has(permission);
}

function deny(res: any, permission: string): void {
  res.status(403).json({
    error: `You do not have permission to perform this action. Required: ${permission}`,
  });
}

function num(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const CreateProductBody = z.object({
  name: z.string().min(1),
  categoryId: z.string().min(1),
  category: z.string().min(1),
  baseUnit: z.string().min(1).default("piece"),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  cost: z.number().int().nonnegative().default(0),
  price: z.number().int().nonnegative(),
  tax: z.number().int().nonnegative().default(16),
  trackInventory: z.boolean().default(true),
  accent: z.string().default("amber"),
});

const UpdateProductBody = CreateProductBody.partial();

const CreateUnitBody = z.object({
  name: z.string().min(1),
  abbreviation: z.string().min(1),
  conversionFactor: z.number().positive(),
  isBaseUnit: z.boolean().default(false),
  sellingPrice: z.number().int().nonnegative(),
  cost: z.number().int().nonnegative().nullable().optional(),
  wholeUnitsOnly: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const CreateBarcodeBody = z.object({
  barcode: z.string().min(1),
  unitId: z.string().min(1),
});

async function audit(
  organizationId: string,
  branchId: string | null,
  staffId: string | null,
  action: "CREATE" | "UPDATE" | "DELETE" | "ADJUST",
  entity: string,
  entityId: string,
  detail: string,
): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: uid("audit"),
    organizationId,
    branchId,
    staffId,
    action,
    entity,
    entityId,
    detail,
  });
}

function serializeProduct(row: typeof productsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    category: row.category,
    price: row.price,
    unit: row.baseUnit,
    stock: num(row.stock),
    available: row.available === "true" && row.active,
    accent: productAccentColors[row.accent] ?? row.accent,
    baseUnit: row.baseUnit,
    sku: row.sku,
    barcode: row.barcode,
    cost: row.cost,
    tax: row.tax,
    trackInventory: row.trackInventory,
    active: row.active,
    description: row.description,
  };
}

// --- Products ---------------------------------------------------------------

router.post("/", async (req, res): Promise<void> => {
  if (!can(req, "manage_products")) return deny(res, "manage_products");
  const tenant = getTenant(req);
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  // Barcodes are unique across the platform so a scan is never ambiguous.
  if (data.barcode) {
    const [existing] = await db
      .select({ id: productBarcodesTable.id })
      .from(productBarcodesTable)
      .where(eq(productBarcodesTable.barcode, data.barcode));
    if (existing) {
      res.status(409).json({ error: "That barcode is already assigned to a product" });
      return;
    }
  }

  const productId = uid("prod");
  const [row] = await db
    .insert(productsTable)
    .values({
      id: productId,
      organizationId: tenant.organizationId,
      categoryId: data.categoryId,
      name: data.name,
      category: data.category,
      baseUnit: data.baseUnit,
      unit: data.baseUnit,
      sku: data.sku ?? null,
      barcode: data.barcode ?? null,
      description: data.description ?? null,
      cost: data.cost,
      price: data.price,
      tax: data.tax,
      trackInventory: data.trackInventory,
      accent: data.accent,
      available: "true",
      active: true,
    })
    .returning();

  await db.insert(productUnitsTable).values({
    id: uid("unit"),
    productId,
    name: data.baseUnit,
    abbreviation: data.baseUnit.slice(0, 4).toUpperCase(),
    conversionFactor: "1",
    isBaseUnit: true,
    sellingPrice: data.price,
    cost: data.cost,
    sortOrder: 0,
  });

  if (data.barcode) {
    const [baseUnit] = await db
      .select()
      .from(productUnitsTable)
      .where(
        and(eq(productUnitsTable.productId, productId), eq(productUnitsTable.isBaseUnit, true)),
      );
    if (baseUnit) {
      await db.insert(productBarcodesTable).values({
        id: uid("bc"),
        productId,
        barcode: data.barcode,
        unitId: baseUnit.id,
      });
    }
  }

  // Make the product sellable in every branch of the organization.
  const branches = await db
    .select({ id: branchesTable.id })
    .from(branchesTable)
    .where(eq(branchesTable.organizationId, tenant.organizationId));
  if (branches.length) {
    await db.insert(productBranchAvailabilityTable).values(
      branches.map((b) => ({
        id: uid("pba"),
        productId,
        branchId: b.id,
        price: null,
        trackInventory: data.trackInventory,
        available: true,
      })),
    );
  }

  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "CREATE",
    "PRODUCT",
    productId,
    `Created product ${data.name} (base unit ${data.baseUnit}, ${formatMoney(data.price, await getTenantSettings(tenant.organizationId))})`,
  );

  res.status(201).json(serializeProduct(row));
});

router.patch("/:productId", async (req, res): Promise<void> => {
  if (!can(req, "manage_products")) return deny(res, "manage_products");
  const tenant = getTenant(req);
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, req.params.productId),
        eq(productsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const data = parsed.data as Partial<typeof productsTable.$inferInsert>;
  if (data.price !== undefined || data.baseUnit !== undefined) {
    if (!can(req, "manage_prices")) return deny(res, "manage_prices");
  }

  const [row] = await db
    .update(productsTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(productsTable.id, existing.id))
    .returning();

  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "UPDATE",
    "PRODUCT",
    existing.id,
    `Updated product ${existing.name}`,
  );

  res.json(serializeProduct(row));
});

router.delete("/:productId", async (req, res): Promise<void> => {
  if (!can(req, "manage_products")) return deny(res, "manage_products");
  const tenant = getTenant(req);
  const [existing] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, req.params.productId),
        eq(productsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // Products referenced by financial or inventory records are deactivated, never
  // deleted, so history stays intact.
  const [stock] = await db
    .select({ id: inventoryItemsTable.id })
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.productId, existing.id))
    .limit(1);

  if (stock) {
    const [row] = await db
      .update(productsTable)
      .set({ active: false, available: "false", updatedAt: new Date() })
      .where(eq(productsTable.id, existing.id))
      .returning();
    await audit(
      tenant.organizationId,
      tenant.branchId,
      tenant.staffId,
      "UPDATE",
      "PRODUCT",
      existing.id,
      `Deactivated product ${existing.name} (has stock records)`,
    );
    res.json(serializeProduct(row));
    return;
  }

  await db.delete(productBarcodesTable).where(eq(productBarcodesTable.productId, existing.id));
  await db
    .delete(productBranchAvailabilityTable)
    .where(eq(productBranchAvailabilityTable.productId, existing.id));
  await db.delete(productUnitsTable).where(eq(productUnitsTable.productId, existing.id));
  await db.delete(productsTable).where(eq(productsTable.id, existing.id));

  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "DELETE",
    "PRODUCT",
    existing.id,
    `Deleted product ${existing.name}`,
  );

  res.status(204).send();
});

// --- Selling units ----------------------------------------------------------

router.get("/:productId/units", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const units = await db
    .select()
    .from(productUnitsTable)
    .where(eq(productUnitsTable.productId, req.params.productId))
    .orderBy(productUnitsTable.sortOrder);
  res.json(units);
});

router.post("/:productId/units", async (req, res): Promise<void> => {
  if (!can(req, "manage_prices")) return deny(res, "manage_prices");
  const tenant = getTenant(req);
  const parsed = CreateUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, req.params.productId),
        eq(productsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // Exactly one base unit per product.
  if (parsed.data.isBaseUnit) {
    await db
      .update(productUnitsTable)
      .set({ isBaseUnit: false })
      .where(eq(productUnitsTable.productId, product.id));
  }

  const [row] = await db
    .insert(productUnitsTable)
    .values({
      id: uid("unit"),
      productId: product.id,
      name: parsed.data.name,
      abbreviation: parsed.data.abbreviation,
      conversionFactor: String(parsed.data.conversionFactor),
      isBaseUnit: parsed.data.isBaseUnit,
      sellingPrice: parsed.data.sellingPrice,
      cost: parsed.data.cost ?? null,
      wholeUnitsOnly: parsed.data.wholeUnitsOnly,
      sortOrder: parsed.data.sortOrder,
    })
    .returning();

  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "CREATE",
    "PRODUCT_UNIT",
    row.id,
    `Added unit ${row.name} (${row.abbreviation}) to ${product.name}: ${row.conversionFactor} ${product.baseUnit} = 1 unit, ${formatMoney(row.sellingPrice, await getTenantSettings(tenant.organizationId))}`,
  );

  res.status(201).json(row);
});

router.patch("/:productId/units/:unitId", async (req, res): Promise<void> => {
  if (!can(req, "manage_prices")) return deny(res, "manage_prices");
  const tenant = getTenant(req);
  const parsed = CreateUnitBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(productUnitsTable)
    .set({
      name: parsed.data.name,
      abbreviation: parsed.data.abbreviation,
      conversionFactor:
        parsed.data.conversionFactor !== undefined
          ? String(parsed.data.conversionFactor)
          : undefined,
      sellingPrice: parsed.data.sellingPrice,
      cost: parsed.data.cost,
      wholeUnitsOnly: parsed.data.wholeUnitsOnly,
      sortOrder: parsed.data.sortOrder,
    })
    .where(
      and(
        eq(productUnitsTable.id, req.params.unitId),
        eq(productUnitsTable.productId, req.params.productId),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }

  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "UPDATE",
    "PRODUCT_UNIT",
    row.id,
    `Updated unit ${row.name} price to ${formatMoney(row.sellingPrice, await getTenantSettings(tenant.organizationId))}`,
  );

  res.json(row);
});

router.delete("/:productId/units/:unitId", async (req, res): Promise<void> => {
  if (!can(req, "manage_prices")) return deny(res, "manage_prices");
  const tenant = getTenant(req);
  const [row] = await db
    .select()
    .from(productUnitsTable)
    .where(
      and(
        eq(productUnitsTable.id, req.params.unitId),
        eq(productUnitsTable.productId, req.params.productId),
      ),
    );
  if (!row) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }
  if (row.isBaseUnit) {
    res.status(400).json({ error: "The base unit cannot be removed" });
    return;
  }

  await db.delete(productUnitsTable).where(eq(productUnitsTable.id, row.id));
  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "DELETE",
    "PRODUCT_UNIT",
    row.id,
    `Removed unit ${row.name}`,
  );
  res.status(204).send();
});

// --- Barcodes ---------------------------------------------------------------

router.get("/barcodes/:barcode", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const code = String(req.params.barcode).trim();
  if (!code) {
    res.status(400).json({ error: "A barcode is required" });
    return;
  }

  const [row] = await db
    .select({
      product: productsTable,
      unit: productUnitsTable,
      barcodeId: productBarcodesTable.id,
    })
    .from(productBarcodesTable)
    .innerJoin(productsTable, eq(productBarcodesTable.productId, productsTable.id))
    .leftJoin(productUnitsTable, eq(productBarcodesTable.unitId, productUnitsTable.id))
    .where(
      and(
        eq(productBarcodesTable.barcode, code),
        eq(productsTable.organizationId, tenant.organizationId),
      ),
    );

  if (!row) {
    res.status(404).json({ error: "Product not found", barcode: code });
    return;
  }

  const [stock] = tenant.branchId
    ? await db
        .select()
        .from(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.productId, row.product.id),
            eq(inventoryItemsTable.branchId, tenant.branchId),
          ),
        )
    : [];

  res.json({
    productId: row.product.id,
    name: row.product.name,
    category: row.product.category,
    baseUnit: row.product.baseUnit,
    trackInventory: row.product.trackInventory,
    active: row.product.active,
    stock: stock ? num(stock.currentQuantity) : null,
    stockUnit: stock?.unit ?? row.product.baseUnit,
    sellingUnit: row.unit
      ? {
          id: row.unit.id,
          name: row.unit.name,
          abbreviation: row.unit.abbreviation,
          conversionFactor: num(row.unit.conversionFactor),
          sellingPrice: row.unit.sellingPrice,
          wholeUnitsOnly: row.unit.wholeUnitsOnly,
        }
      : null,
  });
});

router.post("/:productId/barcodes", async (req, res): Promise<void> => {
  if (!can(req, "manage_products")) return deny(res, "manage_products");
  const tenant = getTenant(req);
  const parsed = CreateBarcodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, req.params.productId),
        eq(productsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const [unit] = await db
    .select()
    .from(productUnitsTable)
    .where(
      and(
        eq(productUnitsTable.id, parsed.data.unitId),
        eq(productUnitsTable.productId, product.id),
      ),
    );
  if (!unit) {
    res.status(400).json({ error: "That unit does not belong to this product" });
    return;
  }

  const [existing] = await db
    .select({ id: productBarcodesTable.id })
    .from(productBarcodesTable)
    .where(eq(productBarcodesTable.barcode, parsed.data.barcode));
  if (existing) {
    res.status(409).json({ error: "That barcode is already assigned to a product" });
    return;
  }

  const [row] = await db
    .insert(productBarcodesTable)
    .values({
      id: uid("bc"),
      productId: product.id,
      barcode: parsed.data.barcode,
      unitId: parsed.data.unitId,
    })
    .returning();

  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "CREATE",
    "PRODUCT_BARCODE",
    row.id,
    `Registered barcode ${parsed.data.barcode} for ${product.name} (${unit.name})`,
  );

  res.status(201).json(row);
});

router.delete("/:productId/barcodes/:barcodeId", async (req, res): Promise<void> => {
  if (!can(req, "manage_products")) return deny(res, "manage_products");
  const tenant = getTenant(req);
  const [row] = await db
    .delete(productBarcodesTable)
    .where(
      and(
        eq(productBarcodesTable.id, req.params.barcodeId),
        eq(productBarcodesTable.productId, req.params.productId),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Barcode not found" });
    return;
  }
  await audit(
    tenant.organizationId,
    tenant.branchId,
    tenant.staffId,
    "DELETE",
    "PRODUCT_BARCODE",
    row.id,
    `Removed barcode ${row.barcode}`,
  );
  res.status(204).send();
});

export default router;
