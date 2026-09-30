import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, gte, lt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  activityTable,
  branchesTable,
  eventsTable,
  inventoryAlertsTable,
  ordersTable,
  orderItemsTable,
  paymentsTable,
  productsTable,
  reservationsTable,
  tablesTable,
  tabsTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";

const router: IRouter = Router();

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get("/summary", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const org = tenant.organizationId;
  const branchId = tenant.branchId;
  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const branchFilter = branchId ? eq(ordersTable.branchId, branchId) : undefined;
  const [branch] = branchId
    ? await db.select().from(branchesTable).where(eq(branchesTable.id, branchId))
    : [null];

  const completedToday = await db
    .select({
      id: ordersTable.id,
      total: ordersTable.total,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.organizationId, org),
        eq(ordersTable.status, "COMPLETED"),
        branchFilter,
        gte(ordersTable.createdAt, today),
        lt(ordersTable.createdAt, tomorrow),
      ),
    );

  const revenue = completedToday.reduce((sum, o) => sum + o.total, 0);
  const orderCount = completedToday.length;
  const averageOrderValue = orderCount ? Math.round(revenue / orderCount) : 0;

  // Revenue mix by category, from the items on today's completed orders.
  const todayOrderIds = completedToday.map((o) => o.id);
  const categoryRows = todayOrderIds.length
    ? await db
        .select({
          category: productsTable.category,
          name: productsTable.name,
          quantity: orderItemsTable.quantity,
          total: orderItemsTable.total,
        })
        .from(orderItemsTable)
        .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
        .where(inArray(orderItemsTable.orderId, todayOrderIds))
    : [];

  const categoryTotals = new Map<string, number>();
  const productTotals = new Map<string, { quantity: number; revenue: number }>();
  for (const row of categoryRows) {
    categoryTotals.set(
      row.category,
      (categoryTotals.get(row.category) ?? 0) + row.total,
    );
    const existing = productTotals.get(row.name) ?? { quantity: 0, revenue: 0 };
    productTotals.set(row.name, {
      quantity: existing.quantity + row.quantity,
      revenue: existing.revenue + row.total,
    });
  }

  const paymentRows = todayOrderIds.length
    ? await db
        .select({
          method: sql`coalesce(${paymentsTable.method}, 'OTHER')`,
          amount: sql`coalesce(sum(${paymentsTable.amount}), 0)`,
        })
        .from(paymentsTable)
        .where(inArray(paymentsTable.orderId, todayOrderIds))
        .groupBy(sql`coalesce(${paymentsTable.method}, 'OTHER')`)
    : [];

  // Hourly revenue series for today.
  const hourSeries = new Map<number, number>();
  for (let h = 0; h < 24; h++) hourSeries.set(h, 0);
  for (const order of completedToday) {
    const hour = new Date(order.createdAt).getHours();
    hourSeries.set(hour, (hourSeries.get(hour) ?? 0) + order.total);
  }
  const openHours = [...hourSeries.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => a[0] - b[0]);

  const tableFilter = branchId ? eq(tablesTable.branchId, branchId) : undefined;
  const allTables = await db
    .select({ id: tablesTable.id, status: tablesTable.status })
    .from(tablesTable)
    .where(and(eq(tablesTable.organizationId, org), tableFilter));

  const openTabs = await db
    .select({ id: tabsTable.id, total: tabsTable.total })
    .from(tabsTable)
    .where(
      and(
        eq(tabsTable.organizationId, org),
        eq(tabsTable.status, "OPEN"),
        branchId ? eq(tabsTable.branchId, branchId) : undefined,
      ),
    );

  const [alerts, events, reservations, lowStockCount] = await Promise.all([
    db
      .select({ id: inventoryAlertsTable.id })
      .from(inventoryAlertsTable)
      .where(
        and(
          eq(inventoryAlertsTable.organizationId, org),
          branchId ? eq(inventoryAlertsTable.branchId, branchId) : undefined,
        ),
      ),
    db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.organizationId, org),
          branchId ? eq(eventsTable.branchId, branchId) : undefined,
          inArray(eventsTable.status, ["UPCOMING", "LIVE"]),
        ),
      ),
    db
      .select({ id: reservationsTable.id })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.organizationId, org),
          branchId ? eq(reservationsTable.branchId, branchId) : undefined,
          inArray(reservationsTable.status, ["PENDING", "CONFIRMED", "ACTIVE"]),
        ),
      ),
    db
      .select({ id: inventoryAlertsTable.id })
      .from(inventoryAlertsTable)
      .where(
        and(
          eq(inventoryAlertsTable.organizationId, org),
          eq(inventoryAlertsTable.severity, "OUT"),
          branchId ? eq(inventoryAlertsTable.branchId, branchId) : undefined,
        ),
      ),
  ]);

  const drinks = ["Beer", "Spirits", "Cocktails", "Wine", "Soft Drinks"].reduce(
    (sum, cat) => sum + (categoryTotals.get(cat) ?? 0),
    0,
  );
  const food = ["Food"].reduce((sum, cat) => sum + (categoryTotals.get(cat) ?? 0), 0);
  const other = revenue - drinks - food;

  res.json({
    date: today.toISOString().slice(0, 10),
    branchId,
    branchName: branch?.name ?? null,
    revenue,
    orders: orderCount,
    averageOrderValue,
    activeTables: allTables.filter((t) => t.status === "OCCUPIED").length,
    totalTables: allTables.length,
    activeTabs: openTabs.length,
    drinkRevenue: drinks,
    foodRevenue: food,
    otherRevenue: other,
    lowStockItems: alerts.length,
    outOfStockItems: lowStockCount.length,
    upcomingEvents: events.length,
    reservations: reservations.length,
    outstandingPayments: openTabs.reduce((sum, t) => sum + t.total, 0),
    revenueSeries: (openHours.length
      ? openHours
      : [[new Date().getHours(), 0]]
    ).map(([hour, value]) => ({
      label: `${String(hour).padStart(2, "0")}:00`,
      value,
    })),
    categoryBreakdown: [...categoryTotals.entries()].map(([label, value]) => ({ label, value })),
    paymentBreakdown: paymentRows.map((row) => ({
      label: String(row.method),
      value: Number(row.amount ?? 0),
    })),
    topProducts: [...productTotals.entries()]
      .map(([label, v]) => ({ label, value: v.revenue, quantity: v.quantity }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
  });
});

router.get("/activity", async (req, res): Promise<void> => {
  const tenant = getTenant(req);
  const rows = await db
    .select()
    .from(activityTable)
    .where(
      and(
        eq(activityTable.organizationId, tenant.organizationId),
        tenant.branchId ? eq(activityTable.branchId, tenant.branchId) : undefined,
      ),
    )
    .orderBy(desc(activityTable.timestamp))
    .limit(12);
  res.json(rows);
});

export default router;
