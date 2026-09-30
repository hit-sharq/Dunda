import { Router, type IRouter } from "express";
import { and, eq, ilike, or } from "drizzle-orm";
import {
  AdjustInventoryBody,
  AdjustInventoryResponse,
  GetInventoryResponse,
  GetInventoryResponseItem,
  GetSuppliersResponse,
  GetSuppliersResponseItem,
  CreateSupplierBody,
  CreateSupplierResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  inventoryItemsTable,
  suppliersTable,
  stockMovementsTable,
  productsTable,
  categoriesTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";

const router: IRouter = Router();

router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const { search } = req.query as { search?: string };
  const branchFilter = tenant.branchId
    ? eq(inventoryItemsTable.branchId, tenant.branchId)
    : undefined;
  const searchFilter = search
    ? or(
        ilike(inventoryItemsTable.name, `%${search}%`),
        ilike(inventoryItemsTable.sku, `%${search}%`),
      )
    : undefined;
  const rows = await db
    .select()
    .from(inventoryItemsTable)
    .where(
      and(
        eq(inventoryItemsTable.organizationId, tenant.organizationId),
        branchFilter,
        searchFilter,
      ),
    );
  const response = rows.map((row) =>
    GetInventoryResponseItem.parse({
      id: row.id,
      productId: row.productId ?? null,
      name: row.name,
      category: row.category ?? null,
      sku: row.sku ?? null,
      currentQuantity: Number(row.currentQuantity),
      reorderLevel: Number(row.reorderLevel),
      cost: row.cost ?? null,
      unit: row.unit,
    }),
  );
  res.json(GetInventoryResponse.parse(response));
});

router.post("/", async (req, res): Promise<void> => {
  const ctx = req.clerk?.__staffContext;
  if (!ctx || (!ctx.isOwner && !ctx.permissions.has("adjust_inventory"))) {
    res.status(403).json({
      error:
        "You do not have permission to perform this action. Required: adjust_inventory",
    });
    return;
  }
  const tenant = getTenant(req);
  const parsed = AdjustInventoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const branchId = tenant.branchId ?? "branch-nairobi";
  const result = await db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.id, parsed.data.productId),
          eq(productsTable.organizationId, tenant.organizationId),
        ),
      );
    if (!product) return null;

    const [category] = await tx
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, product.categoryId));

    const [existing] = await tx
      .select()
      .from(inventoryItemsTable)
      .where(
        and(
          eq(inventoryItemsTable.productId, product.id),
          eq(inventoryItemsTable.branchId, branchId),
        ),
      );

    const delta =
      parsed.data.type === "SALE" ? -parsed.data.quantity : parsed.data.quantity;

    if (existing) {
      const newQty = Number(existing.currentQuantity) + delta;
      await tx
        .update(inventoryItemsTable)
        .set({
          currentQuantity: String(newQty),
        })
        .where(eq(inventoryItemsTable.id, existing.id));
      await tx.insert(stockMovementsTable).values({
        id: `move-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        organizationId: tenant.organizationId,
        branchId,
        productId: product.id,
        type: parsed.data.type,
        quantity: String(parsed.data.quantity),
        quantityInBaseUnit: String(delta),
        reason: parsed.data.reason ?? null,
        staffId: tenant.staffId ?? null,
      });
      const [updated] = await tx
        .select()
        .from(inventoryItemsTable)
        .where(eq(inventoryItemsTable.id, existing.id));
      return updated;
    } else {
      const [created] = await tx
        .insert(inventoryItemsTable)
        .values({
          id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          organizationId: tenant.organizationId,
          branchId,
          productId: product.id,
          name: product.name,
          category: category?.name ?? product.category,
          sku: product.sku ?? null,
          currentQuantity: String(delta),
          reorderLevel: "0",
          cost: product.cost ?? null,
          unit: product.baseUnit,
        })
        .returning();
      return created;
    }
  });

  if (!result) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(
    AdjustInventoryResponse.parse({
      id: result.id,
      productId: result.productId ?? null,
      name: result.name,
      category: result.category ?? null,
      sku: result.sku ?? null,
      currentQuantity: Number(result.currentQuantity),
      reorderLevel: Number(result.reorderLevel),
      cost: result.cost ?? null,
      unit: result.unit,
    }),
  );
});

router.get("/suppliers", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.organizationId, tenant.organizationId))
    .orderBy(suppliersTable.name);
  const response = rows.map((row) =>
    GetSuppliersResponseItem.parse({
      id: row.id,
      name: row.name,
      contact: row.contact ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      address: row.address ?? null,
    }),
  );
  res.json(GetSuppliersResponse.parse(response));
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = `sup-${Date.now()}`;
  const [row] = await db
    .insert(suppliersTable)
    .values({
      id,
      organizationId: tenant.organizationId,
      name: parsed.data.name,
      contact: parsed.data.contact ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      address: parsed.data.address ?? null,
    })
    .returning();
  res.status(201).json(
    CreateSupplierResponse.parse({
      id: row.id,
      name: row.name,
      contact: row.contact ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      address: row.address ?? null,
    }),
  );
});

export default router;
