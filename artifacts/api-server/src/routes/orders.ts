import { Router, type IRouter } from "express";
import { and, eq, desc, inArray, type SQL } from "drizzle-orm";
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
  orderTicketsTable,
  orderTicketItemsTable,
  tablesTable,
  ordersTable,
  productsTable,
  productUnitsTable,
  inventoryItemsTable,
  stockMovementsTable,
  inventoryAlertsTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import { deductInventoryForOrderItem } from "../lib/inventory";
import { BranchScopeError, requireBranchScope } from "../lib/branchScope";
import { calculateTotals, formatMoney, getTenantSettings } from "../lib/tenantSettings";
import { nextDocumentNumber } from "../lib/numbering";
import { logAuditEntry } from "../lib/auditLogger";
import { publish } from "../lib/realtime";
import { InvalidTransitionError, ORDER_STATUS_TRANSITIONS } from "../lib/orderWorkflow";
import {
  isClosed,
  loadCategoryStations,
  splitIntoTickets,
  type TicketLine,
} from "../lib/routing";
import { hasPermission, type StaffContext } from "../lib/permissions";

const router: IRouter = Router();

function can(ctx: StaffContext | undefined, permission: string): boolean {
  if (!ctx) return false;
  return ctx.isOwner || ctx.permissions.has(permission);
}

function deny(res: any, permission: string): void {
  res.status(403).json({
      error: "You do not have permission to perform this action.",
      code: "INSUFFICIENT_PERMISSION",
      required: permission,
    });
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    await deductInventoryForOrderItem(tx, order, item, ctx);
  }
}

/**
 * Deducts one order line.
 *
 * Every order item carries a recorded quantity in the product's configured base
 * unit (see orderItemUnitsTable), so deduction is exact regardless of whether
 * the item was sold as a piece, pack, bottle, glass or shot.
 *
 * A station ticket deducts its own lines when it is served, so a table whose
 * drinks are served before its food still has both accounted for.
 */

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
  let branchId: string;
  try {
    branchId = requireBranchScope(tenant);
  } catch (err) {
    res.status((err as BranchScopeError).status ?? 400).json({ error: (err as Error).message });
    return;
  }
  const id = `ord-${Date.now()}`;
  // Allocated per branch; the previous epoch-millisecond slice wrapped roughly
  // every eleven days and could collide.
  const number = `#${await nextDocumentNumber(db, tenant.organizationId, branchId, "order", "", 6)}`;
  // Reject early if the table is taken, rather than creating an order for a
  // table the floor already shows as busy.
  if (parsed.data.tableId) {
    const [table] = await db
      .select({ name: tablesTable.name, status: tablesTable.status, branchId: tablesTable.branchId })
      .from(tablesTable)
      .where(
        and(
          eq(tablesTable.id, parsed.data.tableId),
          eq(tablesTable.organizationId, tenant.organizationId),
        ),
      );
    if (!table || table.branchId !== branchId) {
      res.status(404).json({ error: "That table does not exist in this branch." });
      return;
    }
    if (table.status !== "AVAILABLE") {
      res.status(409).json({
        error: `${table.name} is already ${table.status.toLowerCase().replace("_", " ")}.`,
        code: "TABLE_NOT_AVAILABLE",
      });
      return;
    }
  }

  const order = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(ordersTable)
      .values({
        id,
        organizationId: tenant.organizationId,
        branchId,
        number,
        tableName: parsed.data.table,
        tableId: parsed.data.tableId ?? null,
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

    // Mark the table busy for as long as the ticket is open.
    if (order.tableId) {
      await tx
        .update(tablesTable)
        .set({ status: "OCCUPIED" })
        .where(
          and(
            eq(tablesTable.id, order.tableId),
            eq(tablesTable.organizationId, tenant.organizationId),
          ),
        );
    }

    // Resolve the preparing station for every category on this order once,
    // rather than per line.
    const productRows = await tx
      .select({ id: productsTable.id, categoryId: productsTable.categoryId })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.organizationId, tenant.organizationId),
          inArray(productsTable.id, parsed.data.items.map((i) => i.productId)),
        ),
      );
    const stationByCategory = await loadCategoryStations(
      tenant.organizationId,
      productRows.map((r) => r.categoryId).filter((c): c is string => Boolean(c)),
    );

    const ticketLines: TicketLine[] = [];
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

      ticketLines.push({
        orderItemId,
        name: product.name,
        quantity: item.quantity,
        notes: item.notes ?? null,
        station: stationByCategory.get(product.categoryId ?? "") ?? "BAR",
      });
    }

    // One ticket per preparation station. They share the order for billing but
    // advance independently, so serving the drinks does not clear the food from
    // the pass.
    for (const [station, lines] of splitIntoTickets(ticketLines)) {
      const [ticket] = await tx
        .insert(orderTicketsTable)
        .values({
          id: uid("ticket"),
          organizationId: tenant.organizationId,
          branchId,
          orderId: order.id,
          station,
          number: `${order.number}-${station === "BAR" ? "B" : "K"}`,
          status: "PENDING",
          notes: null,
        })
        .returning();
      if (lines.length) {
        await tx.insert(orderTicketItemsTable).values(
          lines.map((line, index) => ({
            id: `${ticket.id}-${index}`,
            organizationId: tenant.organizationId,
            ticketId: ticket.id,
            orderItemId: line.orderItemId,
            name: line.name,
            quantity: line.quantity,
            notes: line.notes,
          })),
        );
      }
    }

    // Orders are always created with no discount; discounts are applied later
    // through a dedicated flow. The breakdown still comes from the tenant's
    // configured rates rather than module-level constants.
    const totals = calculateTotals(
      subtotal,
      0,
      await getTenantSettings(tenant.organizationId),
    );
    const [updated] = await tx
      .update(ordersTable)
      .set({
        ...totals,
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
    detail: `${order.number} · ${items.length} item(s) · ${formatMoney(order.total, await getTenantSettings(order.organizationId))}`,
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

  let updated: typeof ordersTable.$inferSelect | null = null;
  try {
    updated = await db.transaction(async (tx) => {
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

    // The kitchen workflow is enforced here rather than in each client, so a
    // ticket cannot skip a stage because a caller used a different UI.
    const allowed = ORDER_STATUS_TRANSITIONS[existing.status];
    if (allowed && !allowed.includes(body.data.status)) {
      throw new InvalidTransitionError(existing.status, body.data.status);
    }

    // Inventory is deducted exactly once, on the transition into COMPLETED.
    if (body.data.status === "COMPLETED" && existing.status !== "COMPLETED") {
      await deductInventoryForOrder(tx, existing, ctx ?? null);
    }

    // The table is released once the ticket has been served, completed, or
    // cancelled, so the floor stops showing a seat that is no longer being used.
    if (
      existing.tableId &&
      ["SERVED", "COMPLETED", "CANCELLED"].includes(body.data.status) &&
      !["SERVED", "COMPLETED", "CANCELLED"].includes(existing.status)
    ) {
      await tx
        .update(tablesTable)
        .set({ status: "AVAILABLE", tabId: null, customer: null, total: 0 })
        .where(
          and(
            eq(tablesTable.id, existing.tableId),
            eq(tablesTable.organizationId, tenant.organizationId),
          ),
        );
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
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      res.status(err.status).json({ error: err.message, code: "INVALID_STATUS_TRANSITION" });
      return;
    }
    throw err;
  }

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
