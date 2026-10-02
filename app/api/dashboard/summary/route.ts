import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";
import { getTenantSettings } from "@/lib/server/settings";
import { splitByCategory } from "@/lib/server/money";

export const dynamic = "force-dynamic";

/**
 * The club's live command centre.
 *
 * Every figure is derived from transactions rather than carried on a counter, so
 * the dashboard cannot drift away from the orders it claims to summarise. Revenue
 * is split into bar, food and pool, but the guest only ever sees one bill.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  // "Today" is the club's day, not UTC's. A venue in Nairobi closing at 4am would
  // otherwise see its morning trade filed under the previous evening.
  const timezone = await branchTimezone(organizationId, branchId);
  const { start, end } = dayBounds(timezone);

  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });

  const [
    orders,
    payments,
    poolSessions,
    tabs,
    tables,
    poolTables,
    staffOnShift,
    lowStock,
    reservations,
    events,
    topItems,
  ] = await Promise.all([
    prisma.dunda_orders.findMany({
      where: { ...scope, created_at: { gte: start, lt: end } },
      select: { id: true, status: true, subtotal: true, total: true, created_at: true },
    }),
    prisma.dunda_payments.findMany({
      where: { ...scope, paid_at: { gte: start, lt: end }, status: { not: "VOIDED" } },
      select: { id: true, amount: true, method: true, paid_at: true, reference: true },
      orderBy: { paid_at: "desc" },
      take: 8,
    }),
    prisma.dunda_pool_sessions.findMany({
      where: {
        ...scope,
        started_at: { gte: start, lt: end },
        status: { in: ["COMPLETED"] },
      },
      select: { charge: true, billable_minutes: true },
    }),
    prisma.dunda_tabs.findMany({
      where: orgWhere(organizationId, {
        branch_id: branchId ?? undefined,
        status: { in: ["OPEN", "SETTLED", "ON_ACCOUNT"] },
      }),
      select: { id: true, outstanding: true },
    }),
    prisma.dunda_tables.findMany({
      where: orgWhere(organizationId, branchId ? { branch_id: branchId } : undefined),
      select: { id: true, status: true },
    }),
    prisma.dunda_pool_tables.findMany({
      where: orgWhere(organizationId, branchId ? { branch_id: branchId } : undefined),
      select: { id: true, status: true },
    }),
    prisma.dunda_staff_shifts.findMany({
      where: { ...scope, status: "OPEN", clock_out_at: null },
      select: { id: true, dunda_staff: { select: { id: true, name: true } } },
    }),
    prisma.dunda_inventory_alerts.count({ where: { ...scope, severity: "LOW" } }),
    prisma.dunda_reservations.count({
      where: {
        ...scope,
        starts_at: { gte: new Date() },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    }),
    prisma.dunda_events.count({
      where: orgWhere(organizationId, { status: { in: ["UPCOMING", "LIVE"] } }),
    }),
    prisma.dunda_order_items.groupBy({
      by: ["name", "category_id"],
      where: { dunda_orders: { ...scope, created_at: { gte: start, lt: end } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
  ]);

  const settings = await getTenantSettings(organizationId);

  const completed = orders.filter((o) => o.status === "COMPLETED");
  const orderRevenue = completed.reduce((sum, o) => sum + o.total, 0);
  const poolRevenue = poolSessions.reduce((sum, s) => sum + s.charge, 0);
  const tabRevenue = await tabRevenueFor(scope, start, end);

  // Split what came in by where it came from. Pool is separated out because it is
  // billed on time, not on items; the rest follows the item categories.
  const split = splitByCategory(
    (await tabLinesFor(scope, start, end)).map((line) => ({
      category: line.category,
      amount: line.total,
    })),
  );
  const bar = split.bar + split.other;
  const food = split.food;
  const pool = split.pool > 0 ? split.pool : poolRevenue;

  const revenue = Math.max(orderRevenue, tabRevenue) || bar + food + pool;
  const outstanding = tabs.reduce((sum, t) => sum + t.outstanding, 0);

  return NextResponse.json({
    date: new Date().toISOString().slice(0, 10),
    revenue,
    orders: completed.length,
    averageOrderValue: completed.length > 0 ? Math.round(revenue / completed.length) : 0,
    activeTables: tables.filter((t) => t.status === "OCCUPIED").length,
    totalTables: tables.length,
    activeTabs: tabs.length,
    branchId,
    branchName: branchId ? await branchName(branchId) : null,
    foodRevenue: food,
    drinkRevenue: bar,
    otherRevenue: pool,
    poolRevenue: pool,
    lowStockItems: lowStock,
    upcomingEvents: events,
    reservations,
    outstandingPayments: outstanding,
    poolTablesOccupied: poolTables.filter((p) => p.status === "OCCUPIED").length,
    poolTablesTotal: poolTables.length,
    staffOnShift: staffOnShift.length,
    staffNames: staffOnShift.map((s) => s.dunda_staff.name),
    revenueSeries: await revenueSeries(scope, start, end, settings.currency),
    categoryBreakdown: [
      { label: "Bar", value: bar },
      { label: "Food", value: food },
      { label: "Pool", value: pool },
    ].filter((point) => point.value > 0),
    paymentBreakdown: byMethod(payments),
    topProducts: topItems.map((item) => ({
      label: item.name,
      value: item._sum.total ?? 0,
      quantity: item._sum.quantity ?? 0,
    })),
    recentPayments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      paidAt: p.paid_at.toISOString(),
    })),
    currency: settings.currency,
  });
});

async function tabRevenueFor(
  scope: { organization_id: string; branch_id?: string },
  start: Date,
  end: Date,
): Promise<number> {
  const tabs = await prisma.dunda_tabs.findMany({
    where: { ...scope, opened_at: { gte: start, lt: end } },
    select: { total: true, status: true },
  });
  // Only settled tabs count as revenue. An open tab is money owed, not money in.
  return tabs
    .filter((t) => t.status === "CLOSED" || t.status === "SETTLED")
    .reduce((sum, t) => sum + t.total, 0);
}

async function tabLinesFor(
  scope: { organization_id: string; branch_id?: string },
  start: Date,
  end: Date,
): Promise<{ category: string; total: number }[]> {
  const tabs = await prisma.dunda_tabs.findMany({
    where: { ...scope, opened_at: { gte: start, lt: end } },
    select: { id: true },
  });
  if (tabs.length === 0) return [];
  const lines = await prisma.dunda_tab_items.findMany({
    where: { tab_id: { in: tabs.map((t) => t.id) } },
    select: { category: true, total: true },
  });
  return lines;
}

async function revenueSeries(
  scope: { organization_id: string; branch_id?: string },
  start: Date,
  end: Date,
  currency: string,
) {
  const rows = await prisma.$queryRaw<
    { bucket: Date; revenue: number }[]
  >`
    SELECT date_trunc('day', "paid_at") AS bucket, SUM("amount")::int AS revenue
    FROM "dunda_payments"
    WHERE "organization_id" = ${scope.organization_id}
      AND "paid_at" >= ${start}
      AND "paid_at" < ${end}
      AND "status" <> 'VOIDED'
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  return rows.map((row) => ({
    label: new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short" }).format(row.bucket),
    value: Number(row.revenue),
  }));
}

function byMethod(payments: { method: string; amount: number }[]) {
  const totals = new Map<string, number>();
  for (const payment of payments) {
    totals.set(payment.method, (totals.get(payment.method) ?? 0) + payment.amount);
  }
  return [...totals.entries()].map(([label, value]) => ({ label, value }));
}

async function branchTimezone(organizationId: string, branchId: string | null) {
  if (branchId) {
    const branch = await prisma.dunda_branches.findUnique({
      where: { id: branchId },
      select: { timezone: true },
    });
    if (branch?.timezone) return branch.timezone;
  }
  const settings = await prisma.dunda_organization_settings.findUnique({
    where: { organization_id: organizationId },
    select: { timezone: true },
  });
  return settings?.timezone ?? "Africa/Nairobi";
}

async function branchName(branchId: string) {
  const branch = await prisma.dunda_branches.findUnique({
    where: { id: branchId },
    select: { name: true },
  });
  return branch?.name ?? null;
}

/**
 * The club's day, in the club's own timezone.
 *
 * Computed by formatting now in that zone and reading the date back, because
 * building a UTC timestamp from "00:00 local" is wrong by the zone's offset.
 */
function dayBounds(timezone: string): { start: Date; end: Date } {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const startLocal = new Date(`${ymd}T00:00:00`);
  const endLocal = new Date(`${ymd}T24:00:00`);
  return { start: startLocal, end: endLocal };
}
