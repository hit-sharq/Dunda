import { getAuth } from "@clerk/express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  AddTabItemBody,
  AddTabItemParams,
  AddTabItemResponse,
  CheckoutTabBody,
  CheckoutTabParams,
  CheckoutTabResponse,
  CreateReservationBody,
  CreateReservationResponse,
  CreateTabBody,
  CreateTabResponse,
  GetBranchesResponse,
  GetBranchFloorParams,
  GetBranchFloorResponse,
  GetBranchTablesResponse,
  GetDashboardActivityResponse,
  GetDashboardSummaryResponse,
  GetInventoryAlertsResponse,
  GetInventoryAlertsResponseItem,
  GetOrdersQueryParams,
  GetOrdersResponse,
  GetProductUnitsParams,
  GetProductsQueryParams,
  GetProductsResponse,
  GetReservationsResponse,
  GetTabParams,
  GetTabResponse,
  GetTabsQueryParams,
  GetTabsResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  activityTable,
  branchesTable,
  inventoryAlertsTable,
  inventoryItemsTable,
  stockMovementsTable,
  ordersTable,
  productUnitsTable,
  productsTable,
  reservationsTable,
  tabItemsTable,
  tablesTable,
  tabsTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import { BranchScopeError, requireBranchScope } from "../lib/branchScope";
import { calculateTotals, formatMoney, getTenantSettings } from "../lib/tenantSettings";
import { productAccentColors } from "../lib/constants";
import { nextDocumentNumber } from "../lib/numbering";
import { logAuditEntry } from "../lib/auditLogger";
import { publish } from "../lib/realtime";

const router: IRouter = Router();

function numberValue(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function tabResponse(
  tab: typeof tabsTable.$inferSelect,
  items: (typeof tabItemsTable.$inferSelect)[],
) {
  return {
    id: tab.id,
    number: tab.number,
    customer: tab.customer,
    table: tab.tableName,
    status: tab.status as "OPEN" | "CLOSED",
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      category: item.category,
      unitId: item.unitId ?? null,
      unitName: item.unitName ?? null,
      notes: item.notes ?? null,
    })),
    subtotal: tab.subtotal,
    serviceCharge: tab.serviceCharge,
    tax: tab.tax,
    discount: tab.discount,
    total: tab.total,
    openedAt: tab.openedAt.toISOString(),
  };
}

async function getTabWithItems(tabId: string) {
  const [tab] = await db.select().from(tabsTable).where(eq(tabsTable.id, tabId));
  if (!tab) return null;
  const items = await db
    .select()
    .from(tabItemsTable)
    .where(eq(tabItemsTable.tabId, tabId))
    .orderBy(tabItemsTable.name);
  return tabResponse(tab, items);
}

router.get("/branches", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.organizationId, tenant.organizationId))
    .orderBy(branchesTable.name);
  res.json(GetBranchesResponse.parse(rows));
});

router.get("/branches/:branchId/floor", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetBranchFloorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const sections = await db
    .select()
    .from(tablesTable)
    .where(
      and(
        eq(tablesTable.branchId, params.data.branchId),
        eq(tablesTable.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(tablesTable.section, tablesTable.name);
  const grouped = sections.reduce(
    (result, table) => {
      result[table.section] ??= [];
      result[table.section].push({
        id: table.id,
        name: table.name,
        section: table.section,
        seats: table.seats,
        status: table.status,
        total: table.total,
        tabId: table.tabId,
        customer: table.customer,
        x: table.x ?? 0,
        y: table.y ?? 0,
        width: table.width ?? 120,
        height: table.height ?? 120,
      });
      return result;
    },
    {} as Record<string, Array<Record<string, unknown>>>,
  );
  const response = {
    branchId: params.data.branchId,
    sections: Object.entries(grouped).map(([name, tables]) => ({
      id: name.toLowerCase().replaceAll(" ", "-"),
      name,
      tables,
    })),
  };
  res.json(GetBranchFloorResponse.parse(response));
});

router.get("/branches/:branchId/tables", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetBranchFloorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(tablesTable)
    .where(
      and(
        eq(tablesTable.branchId, params.data.branchId),
        eq(tablesTable.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(tablesTable.name);
  res.json(GetBranchTablesResponse.parse(rows));
});

router.get("/products", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetProductsQueryParams.parse(req.query);
  const categoryFilter = params.category
    ? eq(productsTable.category, params.category)
    : undefined;
  const searchFilter = params.search
    ? or(
        ilike(productsTable.name, `%${params.search}%`),
        ilike(productsTable.category, `%${params.search}%`),
      )
    : undefined;
  const rows = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.organizationId, tenant.organizationId),
        categoryFilter,
        searchFilter,
      ),
    )
    .orderBy(productsTable.category, productsTable.name);
  const response = rows.map((product) => ({
    ...product,
    stock: numberValue(product.stock),
    available: product.available === "true",
    accent: productAccentColors[product.accent] ?? product.accent,
  }));
  res.json(GetProductsResponse.parse(response));
});

router.get("/products/:productId/units", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetProductUnitsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const units = await db
    .select()
    .from(productUnitsTable)
    .innerJoin(productsTable, eq(productUnitsTable.productId, productsTable.id))
    .where(
      and(
        eq(productUnitsTable.productId, params.data.productId),
        eq(productsTable.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(productUnitsTable.sortOrder);
  const response = units.map((row) => ({
    id: row.dunda_product_units.id,
    productId: row.dunda_product_units.productId,
    name: row.dunda_product_units.name,
    abbreviation: row.dunda_product_units.abbreviation,
    conversionFactor: numberValue(row.dunda_product_units.conversionFactor),
    sellingPrice: row.dunda_product_units.sellingPrice,
    cost: row.dunda_product_units.cost ?? null,
    wholeUnitsOnly: row.dunda_product_units.wholeUnitsOnly,
    isBaseUnit: row.dunda_product_units.isBaseUnit,
    sortOrder: row.dunda_product_units.sortOrder,
  }));
  res.json(response);
});

router.get("/tabs", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetTabsQueryParams.parse(req.query);
  const filters = [
    eq(tabsTable.organizationId, tenant.organizationId),
    eq(tabsTable.status, params.status ?? "OPEN"),
  ];
  const tabs = await db
    .select()
    .from(tabsTable)
    .where(and(...filters))
    .orderBy(desc(tabsTable.openedAt));
  const response = await Promise.all(
    tabs.map(async (tab) => {
      const items = await db
        .select()
        .from(tabItemsTable)
        .where(eq(tabItemsTable.tabId, tab.id));
      return tabResponse(tab, items);
    }),
  );
  res.json(GetTabsResponse.parse(response));
});

router.post("/tabs", async (req, res): Promise<void> => {
  const ctx = req.clerk?.__staffContext as
    | { isOwner: boolean; permissions: Set<string> }
    | undefined;
  if (!ctx || (!ctx.isOwner && !ctx.permissions.has("view_pos"))) {
    res.status(403).json({
      error: "You do not have permission to perform this action. Required: view_pos",
    });
    return;
  }
  const tenant = getTenant(req);
  const parsed = CreateTabBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let branchId: string;
  try {
    branchId = requireBranchScope(tenant, parsed.data.branchId);
  } catch (err) {
    res.status((err as BranchScopeError).status ?? 400).json({ error: (err as Error).message });
    return;
  }
  const id = `tab-${Date.now()}`;
  // Allocated per branch so two tabs opened in one shift can never share the
  // number printed on the receipt.
  const number = `#${await nextDocumentNumber(db, tenant.organizationId, branchId, "tab", "", 4)}`;
  const [tab] = await db
    .insert(tabsTable)
    .values({
      id,
      organizationId: tenant.organizationId,
      branchId,
      number,
      customer: parsed.data.customer,
      tableName: parsed.data.table,
      status: "OPEN",
      subtotal: 0,
      serviceCharge: 0,
      tax: 0,
      discount: 0,
      total: 0,
    })
    .returning();
  await db
    .update(tablesTable)
    .set({ status: "OCCUPIED", tabId: id, customer: parsed.data.customer })
    .where(
      and(
        eq(tablesTable.name, parsed.data.table),
        eq(tablesTable.branchId, branchId),
      ),
    );
  publish({
    topic: "TABLE_STATUS_CHANGED",
    organizationId: tenant.organizationId,
    branchId,
    entityId: id,
  });

  const response = tabResponse(tab, []);
  res.status(201).json(CreateTabResponse.parse(response));
});

router.get("/tabs/:tabId", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetTabParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tab] = await db
    .select()
    .from(tabsTable)
    .where(
      and(
        eq(tabsTable.id, params.data.tabId),
        eq(tabsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!tab) {
    res.status(404).json({ error: "Tab not found" });
    return;
  }
  const response = await getTabWithItems(tab.id);
  res.json(GetTabResponse.parse(response));
});

router.post("/tabs/:tabId", async (req, res): Promise<void> => {
  const ctx = req.clerk?.__staffContext as
    | { isOwner: boolean; permissions: Set<string> }
    | undefined;
  if (!ctx || (!ctx.isOwner && !ctx.permissions.has("create_order"))) {
    res.status(403).json({
      error: "You do not have permission to perform this action. Required: create_order",
    });
    return;
  }
  const tenant = getTenant(req);
  const params = AddTabItemParams.safeParse(req.params);
  const body = AddTabItemBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [tab] = await db
    .select()
    .from(tabsTable)
    .where(
      and(
        eq(tabsTable.id, params.data.tabId),
        eq(tabsTable.organizationId, tenant.organizationId),
      ),
    );
  const [product] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, body.data.productId),
        eq(productsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!tab || !product) {
    res.status(404).json({ error: "Tab or product not found" });
    return;
  }

  // The selling unit decides the price, exactly as configured server-side.
  const [unit] = body.data.unitId
    ? await db
        .select()
        .from(productUnitsTable)
        .where(
          and(
            eq(productUnitsTable.id, body.data.unitId),
            eq(productUnitsTable.productId, product.id),
          ),
        )
    : [null];
  if (body.data.unitId && !unit) {
    res.status(400).json({ error: "That selling unit does not belong to this product" });
    return;
  }
  if (unit?.wholeUnitsOnly && !Number.isInteger(body.data.quantity)) {
    res.status(400).json({
      error: `${product.name} is sold in whole ${unit.name} units only`,
    });
    return;
  }
  const unitPrice = unit?.sellingPrice ?? product.price;
  const unitName = unit?.name ?? null;

  const existing = await db
    .select()
    .from(tabItemsTable)
    .where(
      and(
        eq(tabItemsTable.tabId, tab.id),
        eq(tabItemsTable.productId, product.id),
        body.data.unitId
          ? eq(tabItemsTable.unitId, body.data.unitId)
          : undefined,
      ),
    );
  if (existing[0]) {
    const item = existing[0];
    await db
      .update(tabItemsTable)
      .set({
        quantity: item.quantity + body.data.quantity,
        total: item.total + unitPrice * body.data.quantity,
      })
      .where(eq(tabItemsTable.id, item.id));
  } else {
    await db.insert(tabItemsTable).values({
      id: `tab-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      organizationId: tenant.organizationId,
      tabId: tab.id,
      productId: product.id,
      name: product.name,
      quantity: body.data.quantity,
      unitPrice,
      total: unitPrice * body.data.quantity,
      category: product.category,
      unitId: body.data.unitId ?? null,
      unitName,
      notes: body.data.notes ?? null,
    });
  }
  const itemRows = await db
    .select()
    .from(tabItemsTable)
    .where(eq(tabItemsTable.tabId, tab.id));
  const subtotal = itemRows.reduce((sum, item) => sum + item.total, 0);
  const totals = calculateTotals(
    subtotal,
    0,
    await getTenantSettings(tab.organizationId),
  );
  await db
    .update(tabsTable)
    .set(totals)
    .where(eq(tabsTable.id, tab.id));
  const response = await getTabWithItems(tab.id);
  res.json(AddTabItemResponse.parse(response));
});

router.post("/tabs/:tabId/checkout", async (req, res): Promise<void> => {
  const ctx = req.clerk?.__staffContext as
    | { isOwner: boolean; permissions: Set<string>; staffId: string | null }
    | undefined;
  if (!ctx || (!ctx.isOwner && !ctx.permissions.has("manage_payments"))) {
    res.status(403).json({
      error:
        "You do not have permission to perform this action. Required: manage_payments",
    });
    return;
  }
  const tenant = getTenant(req);
  const params = CheckoutTabParams.safeParse(req.params);
  const body = CheckoutTabBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const response = await db.transaction(async (tx) => {
    const [tab] = await tx
      .select()
      .from(tabsTable)
      .where(
        and(
          eq(tabsTable.id, params.data.tabId),
          eq(tabsTable.organizationId, tenant.organizationId),
        ),
      );
    if (!tab) return null;
    if (body.data.amount < tab.total) {
      throw new Error("Payment amount is less than the tab total");
    }
    const [closed] = await tx
      .update(tabsTable)
      .set({ status: "CLOSED", closedAt: new Date() })
      .where(eq(tabsTable.id, tab.id))
      .returning();
    await tx
      .update(tablesTable)
      .set({ status: "AVAILABLE", tabId: null, customer: null, total: 0 })
      .where(eq(tablesTable.tabId, tab.id));
    await tx.insert(activityTable).values({
      id: `activity-${Date.now()}`,
      organizationId: tenant.organizationId,
      type: "PAYMENT",
      title: "Payment completed",
      detail: `${tab.number} · ${body.data.method}`,
      amount: body.data.amount,
      branchId: tab.branchId,
    });
    const [branch] = await tx
      .select()
      .from(branchesTable)
      .where(eq(branchesTable.id, tab.branchId));
    if (branch) {
      await tx
        .update(branchesTable)
        .set({ revenueToday: branch.revenueToday + tab.total })
        .where(eq(branchesTable.id, tab.branchId));
    }
    const items = await tx
      .select()
      .from(tabItemsTable)
      .where(eq(tabItemsTable.tabId, tab.id));

    // Selling a tab is a sale: deduct stock in the configured base unit.
    for (const item of items) {
      const [product] = await tx
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, item.productId));
      if (!product?.trackInventory) continue;

      let quantityInBaseUnit = item.quantity;
      if (item.unitId) {
        const [unit] = await tx
          .select()
          .from(productUnitsTable)
          .where(eq(productUnitsTable.id, item.unitId));
        if (unit) quantityInBaseUnit = item.quantity * numberValue(unit.conversionFactor);
      }

      const [stock] = await tx
        .select()
        .from(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.productId, product.id),
            eq(inventoryItemsTable.branchId, tab.branchId),
          ),
        );

      const current = stock ? numberValue(stock.currentQuantity) : 0;
      if (stock) {
        await tx
          .update(inventoryItemsTable)
          .set({ currentQuantity: String(current - quantityInBaseUnit) })
          .where(eq(inventoryItemsTable.id, stock.id));
      } else {
        await tx.insert(inventoryItemsTable).values({
          id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          organizationId: tab.organizationId,
          branchId: tab.branchId,
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
        organizationId: tab.organizationId,
        branchId: tab.branchId,
        productId: product.id,
        type: "SALE",
        quantity: String(item.quantity),
        quantityInBaseUnit: String(-quantityInBaseUnit),
        unitId: item.unitId,
        referenceId: tab.id,
        staffId: tenant.staffId,
      });

      const reorder = stock ? numberValue(stock.reorderLevel) : 0;
      const remaining = current - quantityInBaseUnit;
      if (remaining <= reorder) {
        const [alert] = await tx
          .select()
          .from(inventoryAlertsTable)
          .where(
            and(
              eq(inventoryAlertsTable.productId, product.id),
              eq(inventoryAlertsTable.branchId, tab.branchId),
            ),
          );
        const severity = remaining <= 0 ? "OUT" : "LOW";
        if (alert) {
          await tx
            .update(inventoryAlertsTable)
            .set({ stock: String(remaining), severity })
            .where(eq(inventoryAlertsTable.id, alert.id));
        } else {
          await tx.insert(inventoryAlertsTable).values({
            id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            organizationId: tab.organizationId,
            branchId: tab.branchId,
            productId: product.id,
            name: product.name,
            category: product.category,
            stock: String(remaining),
            minimum: String(reorder),
            unit: product.baseUnit,
            severity,
          });
        }
      }
    }

    return {
      tab: tabResponse(closed, items),
      receiptNumber: `RCP-${new Date().getFullYear()}-${await nextDocumentNumber(db, tenant.organizationId, tab.branchId, "receipt", "", 6)}`,
      paymentMethod: body.data.method,
      paidAt: new Date().toISOString(),
    };
  });
  if (!response) {
    res.status(404).json({ error: "Tab not found" });
    return;
  }

  await logAuditEntry({
    organizationId: tenant.organizationId,
    branchId: tenant.branchId,
    staffId: tenant.staffId,
    action: "CREATE",
    entity: "PAYMENT",
    entityId: response.tab.id,
    detail: `Checkout ${response.tab.number} · ${formatMoney(body.data.amount, await getTenantSettings(tenant.organizationId))} by ${body.data.method} · receipt ${response.receiptNumber}`,
  });

  publish({
    topic: "PAYMENT_COMPLETED",
    organizationId: tenant.organizationId,
    branchId: tenant.branchId,
    entityId: response.tab.id,
  });
  publish({
    topic: "TABLE_STATUS_CHANGED",
    organizationId: tenant.organizationId,
    branchId: tenant.branchId,
    entityId: response.tab.id,
  });
  publish({
    topic: "INVENTORY_UPDATED",
    organizationId: tenant.organizationId,
    branchId: tenant.branchId,
    entityId: response.tab.id,
  });

  res.json(CheckoutTabResponse.parse(response));
});

router.get("/orders", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const params = GetOrdersQueryParams.parse(req.query);
  const filters = [eq(ordersTable.organizationId, tenant.organizationId)];
  if (params.status) {
    filters.push(eq(ordersTable.status, params.status));
  }
  const rows = await db
    .select()
    .from(ordersTable)
    .where(and(...filters))
    .orderBy(desc(ordersTable.createdAt));
  res.json(GetOrdersResponse.parse(rows));
});

router.get("/reservations", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.organizationId, tenant.organizationId))
    .orderBy(reservationsTable.reservationDate, reservationsTable.time);
  const response = rows.map((row) => ({
    id: row.id,
    customer: row.customer,
    phone: row.phone,
    date: row.reservationDate,
    time: row.time,
    table: row.tableName,
    guests: row.guests,
    status: row.status,
  }));
  res.json(GetReservationsResponse.parse(response));
});

router.post("/reservations", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const parsed = CreateReservationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = `reservation-${Date.now()}`;
  const [row] = await db
    .insert(reservationsTable)
    .values({
      id,
      organizationId: tenant.organizationId,
      branchId: requireBranchScope(tenant),
      customer: parsed.data.customer,
      phone: parsed.data.phone,
      reservationDate: parsed.data.date.toISOString().slice(0, 10),
      time: parsed.data.time,
      tableName: parsed.data.table,
      guests: parsed.data.guests,
      status: "PENDING",
      notes: parsed.data.notes ?? null,
    })
    .returning();
  const response = {
    id: row.id,
    customer: row.customer,
    phone: row.phone,
    date: row.reservationDate,
    time: row.time,
    table: row.tableName,
    guests: row.guests,
    status: row.status,
  };

  publish({
    topic: "RESERVATION_CREATED",
    organizationId: tenant.organizationId,
    branchId: row.branchId,
    entityId: row.id,
  });

  res.status(201).json(CreateReservationResponse.parse(response));
});

router.get("/inventory/alerts", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(inventoryAlertsTable)
    .where(eq(inventoryAlertsTable.organizationId, tenant.organizationId));
  const response = rows.map((row) =>
    GetInventoryAlertsResponseItem.parse({
      ...row,
      stock: numberValue(row.stock),
      minimum: numberValue(row.minimum),
      severity: row.severity as "LOW" | "OUT",
    }),
  );
  res.json(GetInventoryAlertsResponse.parse(response));
});


router.patch("/reservations/:reservationId", async (req, res): Promise<void> => {
  const ctx = req.clerk?.__staffContext as
    | { isOwner: boolean; permissions: Set<string> }
    | undefined;
  if (!ctx || (!ctx.isOwner && !ctx.permissions.has("manage_reservations"))) {
    res.status(403).json({
      error:
        "You do not have permission to perform this action. Required: manage_reservations",
    });
    return;
  }
  const tenant = getTenant(req);
  const parsed = z
    .object({
      status: z
        .enum(["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED", "NO_SHOW"])
        .optional(),
      time: z.string().optional(),
      tableName: z.string().optional(),
      guests: z.number().int().min(1).optional(),
      notes: z.string().nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(reservationsTable)
    .where(
      and(
        eq(reservationsTable.id, req.params.reservationId),
        eq(reservationsTable.organizationId, tenant.organizationId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  const [row] = await db
    .update(reservationsTable)
    .set(parsed.data)
    .where(eq(reservationsTable.id, existing.id))
    .returning();

  await logAuditEntry({
    organizationId: tenant.organizationId,
    branchId: existing.branchId,
    staffId: tenant.staffId,
    action: parsed.data.status === "CANCELLED" ? "DISCARD" : "UPDATE",
    entity: "RESERVATION",
    entityId: row.id,
    detail: parsed.data.status
      ? `${row.customer}: ${existing.status} -> ${row.status}`
      : `Updated ${row.customer}`,
  });

  res.json({
    id: row.id,
    customer: row.customer,
    phone: row.phone,
    date: row.reservationDate,
    time: row.time,
    table: row.tableName,
    guests: row.guests,
    status: row.status,
    notes: row.notes ?? null,
  });
});

export default router;
