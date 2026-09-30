import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditLogsTable,
  branchesTable,
  eventReservationsTable,
  eventsTable,
  inventoryAlertsTable,
  inventoryItemsTable,
  ordersTable,
  orderItemsTable,
  paymentsTable,
  productsTable,
  staffTable,
  stockMovementsTable,
  stockCountItemsTable,
  stockCountsTable,
  tablesTable,
  tabsTable,
} from "@workspace/db";
import { getTenant } from "../middlewares/tenantMiddleware";
import { DEFAULT_REPORT_DAYS } from "../lib/constants";
import type { StaffContext } from "../lib/permissions";

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

function num(v: string | number | null | undefined): number {
  return Number(v ?? 0);
}

function range(query: Record<string, unknown>): { from: Date; to: Date } {
  const now = new Date();
  const to = query.dateTo ? new Date(`${String(query.dateTo)}T23:59:59.999Z`) : now;
  const from = query.dateFrom
    ? new Date(`${String(query.dateFrom)}T00:00:00.000Z`)
    : new Date(to.getTime() - DEFAULT_REPORT_DAYS * 24 * 60 * 60 * 1000);
  return { from, to };
}

/** Sales, orders, average order value, plus payment and hourly breakdowns. */
router.get("/sales", async (req, res): Promise<void> => {
  if (!can(req, "view_reports")) return deny(res, "view_reports");
  const tenant = getTenant(req);
  const { from, to } = range(req.query as Record<string, unknown>);
  const branchId = req.query.branchId ? String(req.query.branchId) : tenant.branchId;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.organizationId, tenant.organizationId),
        eq(ordersTable.status, "COMPLETED"),
        branchId ? eq(ordersTable.branchId, branchId) : undefined,
        sql`${ordersTable.createdAt} >= ${from}`,
        sql`${ordersTable.createdAt} <= ${to}`,
      ),
    );

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const totalOrders = orders.length;

  const payments = orders.length
    ? await db
        .select({
          method: paymentsTable.method,
          amount: sql<number>`coalesce(sum(${paymentsTable.amount}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(paymentsTable)
        .where(
          and(
            inArray(paymentsTable.orderId, orders.map((o) => o.id)),
            eq(paymentsTable.status, "SUCCESSFUL"),
          ),
        )
        .groupBy(paymentsTable.method)
    : [];

  const byHour = new Map<string, number>();
  for (const order of orders) {
    const label = `${String(new Date(order.createdAt).getHours()).padStart(2, "0")}:00`;
    byHour.set(label, (byHour.get(label) ?? 0) + order.total);
  }

  const refunds = orders.length
    ? await db
        .select({ amount: sql<number>`coalesce(sum(${paymentsTable.amount}), 0)` })
        .from(paymentsTable)
        .where(
          and(
            inArray(paymentsTable.orderId, orders.map((o) => o.id)),
            inArray(paymentsTable.status, ["REFUNDED", "PARTIALLY_REFUNDED"]),
          ),
        )
    : [{ amount: 0 }];

  res.json({
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
    totalRevenue,
    totalOrders,
    averageOrderValue: totalOrders ? Math.round(totalRevenue / totalOrders) : 0,
    refunded: num(refunds[0]?.amount),
    byPaymentMethod: payments.map((p) => ({
      label: p.method,
      value: num(p.amount),
      count: num(p.count),
    })),
    byHour: [...byHour.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value })),
  });
});

/** Best and slow sellers, plus category totals. */
router.get("/products", async (req, res): Promise<void> => {
  if (!can(req, "view_reports")) return deny(res, "view_reports");
  const tenant = getTenant(req);
  const { from, to } = range(req.query as Record<string, unknown>);
  const branchId = req.query.branchId ? String(req.query.branchId) : tenant.branchId;

  const rows = await db
    .select({
      name: productsTable.name,
      category: productsTable.category,
      quantity: sql<number>`coalesce(sum(${orderItemsTable.quantity}), 0)`,
      revenue: sql<number>`coalesce(sum(${orderItemsTable.total}), 0)`,
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(
      and(
        eq(ordersTable.organizationId, tenant.organizationId),
        eq(ordersTable.status, "COMPLETED"),
        branchId ? eq(ordersTable.branchId, branchId) : undefined,
        sql`${ordersTable.createdAt} >= ${from}`,
        sql`${ordersTable.createdAt} <= ${to}`,
      ),
    )
    .groupBy(productsTable.name, productsTable.category)
    .orderBy(sql`sum(${orderItemsTable.total}) desc`);

  const byCategory = new Map<string, number>();
  for (const row of rows) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + num(row.revenue));
  }

  res.json({
    products: rows.map((r) => ({
      name: r.name,
      category: r.category,
      quantitySold: num(r.quantity),
      revenue: num(r.revenue),
    })),
    byCategory: [...byCategory.entries()].map(([label, value]) => ({ label, value })),
  });
});

/**
 * Inventory position plus movement breakdown. Variance is reported as a neutral
 * discrepancy: it is not attributed to any individual.
 */
router.get("/inventory", async (req, res): Promise<void> => {
  if (!can(req, "view_reports")) return deny(res, "view_reports");
  const tenant = getTenant(req);
  const { from, to } = range(req.query as Record<string, unknown>);
  const branchId = req.query.branchId ? String(req.query.branchId) : tenant.branchId;

  const items = await db
    .select({
      id: inventoryItemsTable.id,
      name: inventoryItemsTable.name,
      category: inventoryItemsTable.category,
      unit: inventoryItemsTable.unit,
      currentQuantity: inventoryItemsTable.currentQuantity,
      reorderLevel: inventoryItemsTable.reorderLevel,
      cost: inventoryItemsTable.cost,
    })
    .from(inventoryItemsTable)
    .where(
      and(
        eq(inventoryItemsTable.organizationId, tenant.organizationId),
        branchId ? eq(inventoryItemsTable.branchId, branchId) : undefined,
      ),
    );

  const movements = await db
    .select({
      type: stockMovementsTable.type,
      quantity: sql<number>`coalesce(sum(${stockMovementsTable.quantityInBaseUnit}), 0)`,
    })
    .from(stockMovementsTable)
    .where(
      and(
        eq(stockMovementsTable.organizationId, tenant.organizationId),
        branchId ? eq(stockMovementsTable.branchId, branchId) : undefined,
        sql`${stockMovementsTable.createdAt} >= ${from}`,
        sql`${stockMovementsTable.createdAt} <= ${to}`,
      ),
    )
    .groupBy(stockMovementsTable.type);

  const counts = await db
    .select({
      variance: stockCountItemsTable.variance,
      productId: stockCountItemsTable.productId,
    })
    .from(stockCountItemsTable)
    .innerJoin(stockCountsTable, eq(stockCountItemsTable.stockCountId, stockCountsTable.id))
    .where(
      and(
        eq(stockCountsTable.organizationId, tenant.organizationId),
        eq(stockCountsTable.status, "APPROVED"),
        branchId ? eq(stockCountsTable.branchId, branchId) : undefined,
      ),
    );

  const discrepancies = counts.filter((c) => Math.abs(num(c.variance)) > 0);

  res.json({
    totalItems: items.length,
    stockValue: items.reduce((sum, i) => sum + num(i.currentQuantity) * i.cost, 0),
    belowReorder: items.filter((i) => num(i.currentQuantity) <= num(i.reorderLevel)).length,
    outOfStock: items.filter((i) => num(i.currentQuantity) <= 0).length,
    byMovement: movements.map((m) => ({ label: m.type, value: num(m.quantity) })),
    discrepancies: discrepancies.map((d) => {
      const item = items.find((i) => i.id === d.productId);
      return {
        productId: d.productId,
        name: item?.name ?? null,
        variance: num(d.variance),
        unit: item?.unit ?? null,
      };
    }),
  });
});

/** Per-staff sales and shift totals. */
router.get("/staff", async (req, res): Promise<void> => {
  if (!can(req, "view_reports")) return deny(res, "view_reports");
  const tenant = getTenant(req);
  const { from, to } = range(req.query as Record<string, unknown>);
  const branchId = req.query.branchId ? String(req.query.branchId) : tenant.branchId;

  const rows = await db
    .select({
      staffId: ordersTable.staffId,
      name: staffTable.name,
      orders: sql<number>`count(${ordersTable.id})`,
      revenue: sql<number>`coalesce(sum(${ordersTable.total}), 0)`,
    })
    .from(ordersTable)
    .leftJoin(staffTable, eq(ordersTable.staffId, staffTable.id))
    .where(
      and(
        eq(ordersTable.organizationId, tenant.organizationId),
        eq(ordersTable.status, "COMPLETED"),
        branchId ? eq(ordersTable.branchId, branchId) : undefined,
        sql`${ordersTable.createdAt} >= ${from}`,
        sql`${ordersTable.createdAt} <= ${to}`,
      ),
    )
    .groupBy(ordersTable.staffId, staffTable.name)
    .orderBy(sql`sum(${ordersTable.total}) desc`);

  res.json(
    rows.map((r) => ({
      staffId: r.staffId,
      name: r.name ?? "Unattributed",
      orders: num(r.orders),
      revenue: num(r.revenue),
      averageOrderValue: num(r.orders) ? Math.round(num(r.revenue) / num(r.orders)) : 0,
    })),
  );
});

/** Table utilisation derived from open and closed tabs. */
router.get("/tables", async (req, res): Promise<void> => {
  if (!can(req, "view_reports")) return deny(res, "view_reports");
  const tenant = getTenant(req);
  const { from, to } = range(req.query as Record<string, unknown>);
  const branchId = req.query.branchId ? String(req.query.branchId) : tenant.branchId;

  const tables = await db
    .select({
      id: tablesTable.id,
      name: tablesTable.name,
      section: tablesTable.section,
      seats: tablesTable.seats,
      status: tablesTable.status,
    })
    .from(tablesTable)
    .where(
      and(
        eq(tablesTable.organizationId, tenant.organizationId),
        branchId ? eq(tablesTable.branchId, branchId) : undefined,
      ),
    );

  const closedTabs = await db
    .select({
      tableName: tabsTable.tableName,
      openedAt: tabsTable.openedAt,
      closedAt: tabsTable.closedAt,
      total: tabsTable.total,
    })
    .from(tabsTable)
    .where(
      and(
        eq(tabsTable.organizationId, tenant.organizationId),
        eq(tabsTable.status, "CLOSED"),
        branchId ? eq(tabsTable.branchId, branchId) : undefined,
        sql`${tabsTable.openedAt} >= ${from}`,
        sql`${tabsTable.openedAt} <= ${to}`,
      ),
    );

  const byTable = new Map<
    string,
    { revenue: number; covers: number; minutes: number }
  >();
  for (const tab of closedTabs) {
    if (!tab.tableName) continue;
    const entry = byTable.get(tab.tableName) ?? { revenue: 0, covers: 0, minutes: 0 };
    entry.revenue += tab.total;
    entry.covers += 1;
    if (tab.closedAt) {
      entry.minutes += (tab.closedAt.getTime() - tab.openedAt.getTime()) / 60000;
    }
    byTable.set(tab.tableName, entry);
  }

  res.json(
    tables.map((t) => {
      const stats = byTable.get(t.name);
      return {
        id: t.id,
        name: t.name,
        section: t.section,
        seats: t.seats,
        status: t.status,
        revenue: stats?.revenue ?? 0,
        covers: stats?.covers ?? 0,
        averageStayMinutes: stats?.covers
          ? Math.round((stats?.minutes ?? 0) / stats.covers)
          : 0,
      };
    }),
  );
});

/** Payment method breakdown, transaction counts and refunds. */
router.get("/payments", async (req, res): Promise<void> => {
  if (!can(req, "view_reports")) return deny(res, "view_reports");
  const tenant = getTenant(req);
  const { from, to } = range(req.query as Record<string, unknown>);
  const branchId = req.query.branchId ? String(req.query.branchId) : tenant.branchId;

  const rows = await db
    .select({
      method: paymentsTable.method,
      amount: sql<number>`coalesce(sum(${paymentsTable.amount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.organizationId, tenant.organizationId),
        branchId ? eq(paymentsTable.branchId, branchId) : undefined,
        sql`${paymentsTable.paidAt} >= ${from}`,
        sql`${paymentsTable.paidAt} <= ${to}`,
      ),
    )
    .groupBy(paymentsTable.method);

  const refunds = await db
    .select({
      amount: sql<number>`coalesce(sum(${paymentsTable.amount}), 0)`,
    })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.organizationId, tenant.organizationId),
        inArray(paymentsTable.status, ["REFUNDED", "PARTIALLY_REFUNDED"]),
        branchId ? eq(paymentsTable.branchId, branchId) : undefined,
      ),
    );

  res.json({
    total: rows.reduce((sum, r) => sum + num(r.amount), 0),
    refunded: num(refunds[0]?.amount),
    byMethod: rows.map((r) => ({
      label: r.method,
      value: num(r.amount),
      count: num(r.count),
    })),
  });
});

/** Event performance: reservations, guests and revenue. */
router.get("/events", async (req, res): Promise<void> => {
  if (!can(req, "view_reports")) return deny(res, "view_reports");
  const tenant = getTenant(req);
  const branchId = req.query.branchId ? String(req.query.branchId) : tenant.branchId;

  const events = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.organizationId, tenant.organizationId),
        branchId ? eq(eventsTable.branchId, branchId) : undefined,
      ),
    )
    .orderBy(desc(eventsTable.date));

  const result = await Promise.all(
    events.map(async (event) => {
      const reservations = await db
        .select()
        .from(eventReservationsTable)
        .where(eq(eventReservationsTable.eventId, event.id));
      const guests = reservations.reduce((sum, r) => sum + r.guests, 0);
      return {
        id: event.id,
        name: event.name,
        date: event.date,
        capacity: event.capacity,
        status: event.status,
        reservations: reservations.length,
        guests,
        revenue: event.revenue,
        utilisation: event.capacity ? Math.round((guests / event.capacity) * 100) : 0,
      };
    }),
  );

  res.json(result);
});

/** Consolidated organization view for HQ. */
router.get("/hq", async (req, res): Promise<void> => {
  if (!can(req, "view_reports")) return deny(res, "view_reports");
  const tenant = getTenant(req);

  const branches = await db
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.organizationId, tenant.organizationId))
    .orderBy(branchesTable.name);

  const perBranch = await Promise.all(
    branches.map(async (branch) => {
      const [revenue, orders, tables, alerts] = await Promise.all([
        db
          .select({ total: sql<number>`coalesce(sum(${ordersTable.total}), 0)` })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.branchId, branch.id),
              eq(ordersTable.status, "COMPLETED"),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)` })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.branchId, branch.id),
              eq(ordersTable.status, "COMPLETED"),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)` })
          .from(tablesTable)
          .where(eq(tablesTable.branchId, branch.id)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(inventoryAlertsTable)
          .where(eq(inventoryAlertsTable.branchId, branch.id)),
      ]);
      return {
        id: branch.id,
        name: branch.name,
        city: branch.city,
        status: branch.status,
        revenue: num(revenue[0]?.total),
        orders: num(orders[0]?.count),
        tables: num(tables[0]?.count),
        inventoryAlerts: num(alerts[0]?.count),
      };
    }),
  );

  const [alerts, events, staff] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryAlertsTable)
      .where(eq(inventoryAlertsTable.organizationId, tenant.organizationId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.organizationId, tenant.organizationId),
          inArray(eventsTable.status, ["UPCOMING", "LIVE"]),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(staffTable)
      .where(
        and(
          eq(staffTable.organizationId, tenant.organizationId),
          eq(staffTable.status, "ACTIVE"),
        ),
      ),
  ]);

  res.json({
    totalRevenue: perBranch.reduce((sum, b) => sum + b.revenue, 0),
    totalOrders: perBranch.reduce((sum, b) => sum + b.orders, 0),
    activeBranches: perBranch.filter((b) => b.status === "LIVE").length,
    branches: perBranch,
    inventoryAlerts: num(alerts[0]?.count),
    upcomingEvents: num(events[0]?.count),
    activeStaff: num(staff[0]?.count),
  });
});

/** Audit trail. */
router.get("/audit-logs", async (req, res): Promise<void> => {
  if (!can(req, "view_audit_logs")) return deny(res, "view_audit_logs");
  const tenant = getTenant(req);
  const entity = req.query.entity ? String(req.query.entity) : null;
  const action = req.query.action ? String(req.query.action) : null;
  const limit = Math.min(num(String(req.query.limit ?? "100")) || 100, 500);

  const rows = await db
    .select({ log: auditLogsTable, name: staffTable.name })
    .from(auditLogsTable)
    .leftJoin(staffTable, eq(auditLogsTable.staffId, staffTable.id))
    .where(
      and(
        eq(auditLogsTable.organizationId, tenant.organizationId),
        tenant.branchId && req.query.allBranches !== "true"
          ? eq(auditLogsTable.branchId, tenant.branchId)
          : undefined,
        entity ? eq(auditLogsTable.entity, entity) : undefined,
        action ? eq(auditLogsTable.action, action) : undefined,
      ),
    )
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      id: r.log.id,
      staffId: r.log.staffId,
      staffName: r.name ?? null,
      branchId: r.log.branchId,
      action: r.log.action,
      entity: r.log.entity,
      entityId: r.log.entityId,
      detail: r.log.detail,
      reason: r.log.reason,
      createdAt: r.log.createdAt,
    })),
  );
});

export default router;
