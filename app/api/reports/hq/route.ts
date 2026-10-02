import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";
import { getTenantSettings } from "@/lib/server/settings";
import { splitByCategory } from "@/lib/server/money";

export const dynamic = "force-dynamic";

/**
 * Reporting. Every figure is derived from the transaction tables — payments,
 * orders, sessions, movements — so a report cannot disagree with the dashboard,
 * because both read the same rows rather than a cached summary.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const range = resolveRange(url.searchParams.get("range"));

  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });
  const paidWindow = { gte: range.start, lte: range.end };
  const settings = await getTenantSettings(organizationId);

  const [payments, orders, sessions, movements, lines, staff] = await Promise.all([
    prisma.dunda_payments.findMany({
      where: { ...scope, status: { not: "VOIDED" }, paid_at: paidWindow },
      select: { id: true, amount: true, method: true, paid_at: true },
    }),
    prisma.dunda_orders.findMany({
      where: { ...scope, created_at: paidWindow },
      select: { id: true, number: true, status: true, total: true, staff_id: true },
    }),
    prisma.dunda_pool_sessions.findMany({
      where: { ...scope, started_at: paidWindow, status: "COMPLETED" },
      select: { id: true, pool_table_id: true, charge: true, billable_minutes: true, actual_seconds: true },
    }),
    prisma.dunda_stock_movements.findMany({
      where: { ...scope, created_at: paidWindow },
      select: { product_id: true, type: true, quantity: true, quantity_in_base_unit: true },
    }),
    prisma.dunda_tab_items.findMany({
      where: { organization_id: organizationId, dunda_tabs: { opened_at: paidWindow } },
      select: { name: true, category: true, quantity: true, total: true, product_id: true },
    }),
    prisma.dunda_staff.findMany({
      where: orgWhere(organizationId),
      select: { id: true, name: true },
    }),
  ]);

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const completedOrders = orders.filter((o) => o.status === "COMPLETED");
  const split = splitByCategory(lines.map((l) => ({ category: l.category, amount: l.total })));
  const poolRevenue = sessions.reduce((sum, s) => sum + s.charge, 0);

  const byMethod = new Map<string, number>();
  for (const payment of payments) {
    byMethod.set(payment.method, (byMethod.get(payment.method) ?? 0) + payment.amount);
  }

  const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const line of lines) {
    const key = line.product_id;
    const existing = byProduct.get(key) ?? { name: line.name, quantity: 0, revenue: 0 };
    existing.quantity += line.quantity;
    existing.revenue += line.total;
    byProduct.set(key, existing);
  }
  const products = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);

  const poolByTable = new Map<string, { name: string; sessions: number; minutes: number; revenue: number }>();
  const poolNames = await prisma.dunda_pool_tables.findMany({
    where: orgWhere(organizationId),
    select: { id: true, name: true },
  });
  const poolNameById = new Map(poolNames.map((p) => [p.id, p.name]));
  for (const s of sessions) {
    const name = poolNameById.get(s.pool_table_id) ?? "Unknown table";
    const entry = poolByTable.get(s.pool_table_id) ?? { name, sessions: 0, minutes: 0, revenue: 0 };
    entry.sessions += 1;
    entry.minutes += s.billable_minutes;
    entry.revenue += s.charge;
    poolByTable.set(s.pool_table_id, entry);
  }

  const stockByType = new Map<string, number>();
  for (const movement of movements) {
    stockByType.set(movement.type, (stockByType.get(movement.type) ?? 0) + Number(movement.quantity_in_base_unit));
  }

  const staffById = new Map(staff.map((s) => [s.id, s.name]));
  const staffSales = new Map<string, { orders: number; revenue: number }>();
  for (const order of completedOrders) {
    const key = order.staff_id ?? "unassigned";
    const entry = staffSales.get(key) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += order.total;
    staffSales.set(key, entry);
  }

  return NextResponse.json({
    range: { from: range.start.toISOString(), to: range.end.toISOString(), label: range.label },
    currency: settings.currency,
    revenue: {
      total: totalRevenue,
      bar: split.bar + split.other,
      food: split.food,
      pool: poolRevenue > 0 ? poolRevenue : split.pool,
    },
    orders: {
      total: orders.length,
      completed: completedOrders.length,
      averageValue: completedOrders.length > 0 ? Math.round(totalRevenue / completedOrders.length) : 0,
    },
    payments: [...byMethod.entries()].map(([label, value]) => ({ label, value })),
    products: {
      bestSellers: products.slice(0, 10).map((p) => ({ ...p, name: p.name })),
      slowMovers: products.slice(-10).reverse().map((p) => ({ ...p, name: p.name })),
    },
    staff: [...staffSales.entries()].map(([id, value]) => ({
      staffId: id,
      name: id === "unassigned" ? "Unassigned" : staffById.get(id) ?? "Unknown",
      orders: value.orders,
      revenue: value.revenue,
    })),
    pool: {
      sessions: sessions.length,
      hours: Math.round((sessions.reduce((s, x) => s + x.billable_minutes, 0) / 60) * 10) / 10,
      revenue: poolRevenue,
      averageMinutes:
        sessions.length > 0
          ? Math.round(sessions.reduce((s, x) => s + x.billable_minutes, 0) / sessions.length)
          : 0,
      byTable: [...poolByTable.values()],
    },
    inventory: {
      movements: [...stockByType.entries()].map(([label, value]) => ({ label, value })),
      wastage: stockByType.get("WASTE") ?? 0,
      sold: stockByType.get("SALE") ?? 0,
      received: stockByType.get("PURCHASE") ?? 0,
    },
  });
});

/**
 * Resolves the report window.
 *
 * Days and months are worked out from the club's own timezone, so "today" means
 * the trading day the staff are actually in rather than a UTC slice that cuts the
 * evening in half.
 */
function resolveRange(value: string | null): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (value === "custom") {
    return { start: new Date(0), end: now, label: "All time" };
  }
  const end = now;
  if (value === "weekly") {
    return { start: daysAgo(7), end, label: "Last 7 days" };
  }
  if (value === "monthly") {
    return { start: daysAgo(30), end, label: "Last 30 days" };
  }
  return { start: startOfDay(now), end, label: "Today" };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
