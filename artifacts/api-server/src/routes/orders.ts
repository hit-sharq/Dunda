import { Router, type IRouter } from "express";
import { and, eq, desc, type SQL } from "drizzle-orm";
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetOrdersQueryParams,
  GetOrdersResponse,
  UpdateOrderStatusBody,
  UpdateOrderStatusParams,
  UpdateOrderStatusResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  orderItemsTable,
  orderItemUnitsTable,
  ordersTable,
  productsTable,
  productUnitsTable,
  inventoryItemsTable,
  stockMovementsTable,
  inventoryAlertsTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import { SERVICE_CHARGE_RATE, TAX_RATE } from "../lib/constants";
import { logAuditEntry } from "../lib/auditLogger";
import { publish } from "../lib/realtime";
import { hasPermission, type StaffContext } from "../lib/permissions";

const router: IRouter = Router();

function can(ctx: StaffContext | undefined, permission: string): boolean {
  if (!ctx) return false;
  return ctx.isOwner || ctx.permissions.has(permission);
}

function deny(res: any, permission: string): void {
  res.status(403).json({
    error: `You do not have permission to perform this action. Required: ${permission}`,
  });
}

function staffContext(req: any): StaffContext | undefined {
  return req.clerk?.__staffContext;
}

/**
 * Deduct inventory for a completed order.
 *
 * Every order item carries a recorded quantity in the product's configured base
 * unit (see orderItemUnitsTable), so deduction is exact regardless of whether
 * the item was sold as a piece, pack, bottle, glass or shot.
 */
async function deductInventoryForOrder(
  tx: any,
  order: typeof ordersTable.$inferSelect,
  ctx: StaffContext | null,
): Promise<void> {
  const items = await tx
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, order.id));

  for (const item of items) {
    const [product] = await tx
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));
    if (!product?.trackInventory) continue;

    const [unitRecord] = await tx
      .select()
      .from(orderItemUnitsTable)
      .where(eq(orderItemUnitsTable.orderItemId, item.id));
    const quantityInBaseUnit = unitRecord
      ? Number(unitRecord.quantityInBaseUnit)
      : item.quantity;

    const [stock] = await tx
      .select()
      .from(inventoryItemsTable)
      .where(
        and(
          eq(inventoryItemsTable.productId, product.id),
          eq(inventoryItemsTable.branchId, order.branchId),
        ),
      );

    let currentQuantity = quantityInBaseUnit;
    if (stock) {
      currentQuantity = Number(stock.currentQuantity) - quantityInBaseUnit;
      await tx
        .update(inventoryItemsTable)
        .set({ currentQuantity: String(currentQuantity) })
        .where(eq(inventoryItemsTable.id, stock.id));
    } else {
      await tx.insert(inventoryItemsTable).values({
        id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        organizationId: order.organizationId,
        branchId: order.branchId,
        productId: product.id,
        name: product.name,
        category: product.category,
        sku: product.sku,
        currentQuantity: String(-quantityInBaseUnit),
        reorderLevel: "0",
        cost: product.cost,
        unit: product.baseUnit,
      });
    }

    await tx.insert(stockMovementsTable).values({
      id: `move-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      organizationId: order.organizationId,
      branchId: order.branchId,
      productId: product.id,
      type: "SALE",
      quantity: String(item.quantity),
      quantityInBaseUnit: String(-quantityInBaseUnit),
      unitId: item.unitId,
      referenceId: order.id,
      reason: null,
      staffId: ctx?.staffId ?? null,
    });

    // Keep low-stock alerts in step with the deduction.
    if (stock) {
      const existingAlert = await tx
        .select()
        .from(inventoryAlertsTable)
        .where(
          and(
            eq(inventoryAlertsTable.productId, product.id),
            eq(inventoryAlertsTable.branchId, order.branchId),
          ),
        );
      const reorderLevel = Number(stock.reorderLevel);
      const severity = currentQuantity <= 0 ? "OUT" : "LOW";
      if (currentQuantity <= reorderLevel) {
        if (existingAlert[0]) {
          await tx
            .update(inventoryAlertsTable)
            .set({ stock: String(currentQuantity), severity })
            .where(eq(inventoryAlertsTable.id, existingAlert[0].id));
        } else {
          await tx.insert(inventoryAlertsTable).values({
            id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            organizationId: order.organizationId,
            branchId: order.branchId,
            productId: product.id,
            name: product.name,
            category: product.category,
            stock: String(currentQuantity),
            minimum: String(reorderLevel),
            unit: product.baseUnit,
            severity,
          });
        }
      } else if (existingAlert[0]) {
        await tx
          .delete(inventoryAlertsTable)
          .where(eq(inventoryAlertsTable.id, existingAlert[0].id));
      }
    }
  }
}

router.get("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetOrdersQueryParams.parse(req.query);
  const filters: SQL[] = [
    eq(ordersTable.organizationId, tenant.organizationId),
  ];
  if (params.status) {
    filters.push(eq(ordersTable.status, params.status));
  }
  const rows = await db
    .select()
    .from(ordersTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(ordersTable.createdAt))
    .limit(100);

  const response = await Promise.all(
    rows.map(async (order) => {
      const items = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, order.id));
      return {
        id: order.id,
        number: order.number,
        table: order.tableName ?? null,
        status: order.status,
        items: items.map((i) => i.name),
        subtotal: order.subtotal ?? 0,
        serviceCharge: order.serviceCharge,
        tax: order.tax,
        discount: order.discount,
        total: order.total,
        notes: order.notes ?? null,
        createdAt: order.createdAt,
      };
    }),
  );
  res.json(GetOrdersResponse.parse(response));
});

router.post("/", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const ctx = staffContext(req);
  if (!can(ctx, "create_order")) {
    deny(res, "create_order");
    return;
  }
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const branchId = tenant.branchId ?? "branch-nairobi";
  const id = `ord-${Date.now()}`;
  const number = `#${String(Date.now()).slice(-6)}`;
  const order = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(ordersTable)
      .values({
        id,
        organizationId: tenant.organizationId,
        branchId,
        number,
        tableName: parsed.data.table,
        customerId: parsed.data.customerId ?? null,
        staffId: parsed.data.staffId ?? null,
        status: "PENDING",
        subtotal: 0,
        serviceCharge: 0,
        tax: 0,
        discount: 0,
        total: 0,
        notes: null,
      })
      .returning();

    let subtotal = 0;
    for (const item of parsed.data.items) {
      const [product] = await tx
        .select()
        .from(productsTable)
        .where(
          and(
            eq(productsTable.id, item.productId),
            eq(productsTable.organizationId, tenant.organizationId),
          ),
        );
      if (!product) continue;

      const unit = item.unitId
        ? (
            await tx
              .select()
              .from(productUnitsTable)
              .where(eq(productUnitsTable.id, item.unitId))
          )[0]
        : undefined;

      const unitPrice = unit?.sellingPrice ?? product.price;
      const conversionFactor = unit ? Number(unit.conversionFactor) : 1;

      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      const orderItemId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await tx.insert(orderItemsTable).values({
        id: orderItemId,
        orderId: order.id,
        productId: product.id,
        unitId: item.unitId ?? null,
        name: product.name,
        quantity: item.quantity,
        unitPrice,
        total: itemTotal,
        notes: item.notes ?? null,
        categoryId: product.categoryId ?? null,
      });

      // Record exactly what happened in the configured base unit so inventory
      // integrity never depends on frontend calculations.
      await tx.insert(orderItemUnitsTable).values({
        id: `oiu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        orderItemId,
        unitId: item.unitId ?? product.id,
        unitName: unit?.name ?? product.baseUnit,
        conversionFactor: String(conversionFactor),
        quantityInBaseUnit: String(item.quantity * conversionFactor),
      });
    }

    const serviceCharge = Math.round(subtotal * SERVICE_CHARGE_RATE);
    const tax = Math.round((subtotal + serviceCharge) * TAX_RATE);
    const [updated] = await tx
      .update(ordersTable)
      .set({
        subtotal,
        serviceCharge,
        tax,
        total: subtotal + serviceCharge + tax,
        status: "PENDING",
      })
      .where(eq(ordersTable.id, order.id))
      .returning();

    return updated;
  });

  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, order.id));

  await logAuditEntry({
    organizationId: tenant.organizationId,
    branchId: order.branchId,
    staffId: tenant.staffId,
    action: "CREATE",
    entity: "ORDER",
    entityId: order.id,
    detail: `${order.number} · ${items.length} item(s) · KES ${order.total}`,
  });

  publish({
    topic: "ORDER_CREATED",
    organizationId: order.organizationId,
    branchId: order.branchId,
    entityId: order.id,
  });

  res.status(201).json(
    CreateOrderResponse.parse({
      id: order.id,
      number: order.number,
      table: order.tableName ?? null,
      status: order.status,
      items: items.map((i) => i.name),
      subtotal: order.subtotal ?? 0,
      serviceCharge: order.serviceCharge,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      notes: order.notes ?? null,
      createdAt: order.createdAt,
    }),
  );
});

router.patch("/:orderId/status", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = UpdateOrderStatusParams.safeParse(req.params);
  const body = UpdateOrderStatusBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const ctx = staffContext(req);
  if (!can(ctx, "modify_order")) {
    deny(res, "modify_order");
    return;
  }
  if (body.data.status === "CANCELLED" && !can(ctx, "void_order")) {
    deny(res, "void_order");
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, params.data.orderId),
          eq(ordersTable.organizationId, tenant.organizationId),
        ),
      );
    if (!existing) return null;

    if (existing.status === body.data.status) return existing;

    // Inventory is deducted exactly once, on the transition into COMPLETED.
    if (body.data.status === "COMPLETED" && existing.status !== "COMPLETED") {
      await deductInventoryForOrder(tx, existing, ctx ?? null);
    }

    const [row] = await tx
      .update(ordersTable)
      .set({ status: body.data.status, updatedAt: new Date() })
      .where(
        and(
          eq(ordersTable.id, existing.id),
          eq(ordersTable.organizationId, tenant.organizationId),
        ),
      )
      .returning();
    return row ?? existing;
  });

  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  await logAuditEntry({
    organizationId: tenant.organizationId,
    branchId: updated.branchId,
    staffId: tenant.staffId,
    action: body.data.status === "CANCELLED" ? "VOID" : "UPDATE",
    entity: "ORDER",
    entityId: updated.id,
    detail: `${updated.number}: ${updated.status} -> ${body.data.status}`,
    reason: (req.body as any)?.reason ?? null,
  });

  publish({
    topic: "ORDER_STATUS_CHANGED",
    organizationId: updated.organizationId,
    branchId: updated.branchId,
    entityId: updated.id,
  });

  // Completing an order moved stock, so the room and inventory screens need to know.
  if (body.data.status === "COMPLETED") {
    publish({
      topic: "INVENTORY_UPDATED",
      organizationId: updated.organizationId,
      branchId: updated.branchId,
      entityId: updated.id,
    });
  }

  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, updated.id));
  res.json(
    UpdateOrderStatusResponse.parse({
      id: updated.id,
      number: updated.number,
      table: updated.tableName ?? null,
      status: updated.status,
      items: items.map((i) => i.name),
      subtotal: updated.subtotal ?? 0,
      serviceCharge: updated.serviceCharge,
      tax: updated.tax,
      discount: updated.discount,
      total: updated.total,
      notes: updated.notes ?? null,
      createdAt: updated.createdAt,
    }),
  );
});

export default router;
