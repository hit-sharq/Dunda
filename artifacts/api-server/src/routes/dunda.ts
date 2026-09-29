import { getAuth } from "@clerk/express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
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
  GetDashboardActivityResponse,
  GetDashboardSummaryResponse,
  GetInventoryAlertsResponse,
  GetInventoryAlertsResponseItem,
  GetOrdersQueryParams,
  GetOrdersResponse,
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
  ordersTable,
  productsTable,
  reservationsTable,
  tabItemsTable,
  tablesTable,
  tabsTable,
} from "@workspace/db";

const router: IRouter = Router();
const DEFAULT_BRANCH_ID = "branch-nairobi";
const SERVICE_CHARGE_RATE = 0.1;
const TAX_RATE = 0.16;
const productAccentColors: Record<string, string> = {
  lime: "#8ea75f",
  sky: "#6f9fb2",
  mint: "#6ea493",
  violet: "#8f80a6",
  rose: "#b67d8c",
  orange: "#c77c4e",
  red: "#b75b56",
  cyan: "#5da3a3",
  gold: "#b08d49",
};

router.use((req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
});

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

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const [branch] = await db
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.id, DEFAULT_BRANCH_ID));
  const activeTables = await db
    .select()
    .from(tablesTable)
    .where(eq(tablesTable.status, "OCCUPIED"));
  const openTabs = await db
    .select()
    .from(tabsTable)
    .where(eq(tabsTable.status, "OPEN"));
  const orders = await db.select().from(ordersTable).limit(100);
  const response = {
    date: new Date().toISOString().slice(0, 10),
    revenue: branch?.revenueToday ?? 0,
    orders: orders.length,
    averageOrderValue: orders.length
      ? Math.round((branch?.revenueToday ?? 0) / orders.length)
      : 0,
    activeTables: activeTables.length,
    activeTabs: openTabs.length,
    poolRevenue: 4200,
    foodRevenue: 38500,
    drinkRevenue: 105200,
    outstandingPayments: openTabs.reduce((sum, tab) => sum + tab.total, 0),
    revenueSeries: [
      { label: "18:00", value: 8200 },
      { label: "19:00", value: 14400 },
      { label: "20:00", value: 21800 },
      { label: "21:00", value: 32600 },
      { label: "22:00", value: 28600 },
      { label: "23:00", value: 41200 },
      { label: "00:00", value: 37800 },
    ],
    categoryBreakdown: [
      { label: "Drinks", value: 105200 },
      { label: "Food", value: 38500 },
      { label: "Pool", value: 4200 },
    ],
    paymentBreakdown: [
      { label: "M-Pesa", value: 67400 },
      { label: "Card", value: 47800 },
      { label: "Cash", value: 32600 },
    ],
    topProducts: [
      { label: "Tusker Lager", value: 86 },
      { label: "Mojito", value: 54 },
      { label: "Nyama Choma", value: 31 },
      { label: "Gin & Tonic", value: 28 },
    ],
  };
  res.json(GetDashboardSummaryResponse.parse(response));
});

router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.timestamp))
    .limit(8);
  res.json(GetDashboardActivityResponse.parse(rows));
});

router.get("/branches", async (_req, res): Promise<void> => {
  const rows = await db.select().from(branchesTable).orderBy(branchesTable.name);
  res.json(GetBranchesResponse.parse(rows));
});

router.get("/branches/:branchId/floor", async (req, res): Promise<void> => {
  const params = GetBranchFloorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const sections = await db
    .select()
    .from(tablesTable)
    .where(eq(tablesTable.branchId, params.data.branchId))
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
      });
      return result;
    },
    {} as Record<
      string,
      Array<{
        id: string;
        name: string;
        section: string;
        seats: number;
        status: string;
        total: number;
        tabId: string | null;
        customer: string | null;
      }>
    >,
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

router.get("/products", async (req, res): Promise<void> => {
  const params = GetProductsQueryParams.parse(req.query);
  const filters = [];
  if (params.category) filters.push(eq(productsTable.category, params.category));
  if (params.search) {
    filters.push(
      or(
        ilike(productsTable.name, `%${params.search}%`),
        ilike(productsTable.category, `%${params.search}%`),
      ),
    );
  }
  const rows = await db
    .select()
    .from(productsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(productsTable.category, productsTable.name);
  const response = rows.map((product) => ({
    ...product,
    stock: numberValue(product.stock),
    available: product.available === "true",
    accent: productAccentColors[product.accent] ?? product.accent,
  }));
  res.json(GetProductsResponse.parse(response));
});

router.get("/tabs", async (req, res): Promise<void> => {
  const params = GetTabsQueryParams.parse(req.query);
  const tabs = await db
    .select()
    .from(tabsTable)
    .where(eq(tabsTable.status, params.status ?? "OPEN"))
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
  const parsed = CreateTabBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = `tab-${Date.now()}`;
  const number = `#${1048 + Math.floor(Math.random() * 100)}`;
  const [tab] = await db
    .insert(tabsTable)
    .values({
      id,
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
    .where(eq(tablesTable.name, parsed.data.table));
  const response = tabResponse(tab, []);
  res.status(201).json(CreateTabResponse.parse(response));
});

router.get("/tabs/:tabId", async (req, res): Promise<void> => {
  const params = GetTabParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const response = await getTabWithItems(params.data.tabId);
  if (!response) {
    res.status(404).json({ error: "Tab not found" });
    return;
  }
  res.json(GetTabResponse.parse(response));
});

router.post("/tabs/:tabId", async (req, res): Promise<void> => {
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
    .where(eq(tabsTable.id, params.data.tabId));
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, body.data.productId));
  if (!tab || !product) {
    res.status(404).json({ error: "Tab or product not found" });
    return;
  }
  const existing = await db
    .select()
    .from(tabItemsTable)
    .where(
      and(
        eq(tabItemsTable.tabId, tab.id),
        eq(tabItemsTable.productId, product.id),
      ),
    );
  if (existing[0]) {
    const item = existing[0];
    await db
      .update(tabItemsTable)
      .set({
        quantity: item.quantity + body.data.quantity,
        total: item.total + product.price * body.data.quantity,
      })
      .where(eq(tabItemsTable.id, item.id));
  } else {
    await db.insert(tabItemsTable).values({
      id: `tab-item-${Date.now()}`,
      tabId: tab.id,
      productId: product.id,
      name: product.name,
      quantity: body.data.quantity,
      unitPrice: product.price,
      total: product.price * body.data.quantity,
      category: product.category,
    });
  }
  const itemRows = await db
    .select()
    .from(tabItemsTable)
    .where(eq(tabItemsTable.tabId, tab.id));
  const subtotal = itemRows.reduce((sum, item) => sum + item.total, 0);
  const serviceCharge = Math.round(subtotal * SERVICE_CHARGE_RATE);
  const tax = Math.round((subtotal + serviceCharge) * TAX_RATE);
  await db
    .update(tabsTable)
    .set({ subtotal, serviceCharge, tax, total: subtotal + serviceCharge + tax })
    .where(eq(tabsTable.id, tab.id));
  const response = await getTabWithItems(tab.id);
  res.json(AddTabItemResponse.parse(response));
});

router.post("/tabs/:tabId/checkout", async (req, res): Promise<void> => {
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
      .where(eq(tabsTable.id, params.data.tabId));
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
      type: "PAYMENT",
      title: "Payment completed",
      detail: `${tab.number} · ${body.data.method}`,
      amount: body.data.amount,
    });
    const [branch] = await tx
      .select()
      .from(branchesTable)
      .where(eq(branchesTable.id, DEFAULT_BRANCH_ID));
    if (branch) {
      await tx
        .update(branchesTable)
        .set({ revenueToday: branch.revenueToday + tab.total })
        .where(eq(branchesTable.id, DEFAULT_BRANCH_ID));
    }
    const items = await tx
      .select()
      .from(tabItemsTable)
      .where(eq(tabItemsTable.tabId, tab.id));
    return {
      tab: tabResponse(closed, items),
      receiptNumber: `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
      paymentMethod: body.data.method,
      paidAt: new Date().toISOString(),
    };
  });
  if (!response) {
    res.status(404).json({ error: "Tab not found" });
    return;
  }
  res.json(CheckoutTabResponse.parse(response));
});

router.get("/orders", async (req, res): Promise<void> => {
  const params = GetOrdersQueryParams.parse(req.query);
  const rows = await db
    .select()
    .from(ordersTable)
    .where(params.status ? eq(ordersTable.status, params.status) : undefined)
    .orderBy(desc(ordersTable.createdAt));
  res.json(GetOrdersResponse.parse(rows));
});

router.get("/reservations", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(reservationsTable)
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
  res.status(201).json(CreateReservationResponse.parse(response));
});

router.get("/inventory/alerts", async (_req, res): Promise<void> => {
  const rows = await db.select().from(inventoryAlertsTable);
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

export default router;