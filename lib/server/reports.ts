import { prisma } from "@/lib/db/client";
import { orgWhere } from "./http";

export interface InventoryDiscrepancy {
  productId: string;
  name: string | null;
  variance: number;
  unit: string | null;
}

export interface InventoryReport {
  totalItems: number;
  stockValue: number;
  belowReorder: number;
  outOfStock: number;
  byMovement: Array<{ label: string; value: number }>;
  discrepancies: InventoryDiscrepancy[];
}

/**
 * Inventory position, movements and discrepancies.
 *
 * The position is a snapshot of what the shelves hold
 * right now, and the discrepancies are what the latest
 * approved stock count found at each branch. Both are
 * derived from the same rows the till and the storeroom
 * write, so the report cannot disagree with the stock
 * on hand.
 */
export async function getInventoryReport(
  organizationId: string,
  branchId?: string | null,
): Promise<InventoryReport> {
  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });

  const [products, movements, approvedCounts] = await Promise.all([
    prisma.dunda_products.findMany({
      where: { ...scope, active: true, track_inventory: true },
      select: {
        id: true,
        cost: true,
        stock: true,
        minimum_stock: true,
      },
    }),
    prisma.dunda_stock_movements.groupBy({
      by: ["type"],
      where: scope,
      _sum: { quantity_in_base_unit: true },
    }),
    prisma.dunda_stock_counts.findMany({
      where: { ...scope, status: "APPROVED" },
      orderBy: { created_at: "desc" },
      select: { id: true, branch_id: true },
    }),
  ]);

  const totalItems = products.length;
  const stockValue = products.reduce(
    (sum, product) => sum + product.cost * Number(product.stock),
    0,
  );
  const belowReorder = products.filter(
    (product) => Number(product.stock) <= Number(product.minimum_stock),
  ).length;
  const outOfStock = products.filter((product) => Number(product.stock) === 0).length;

  const byMovement = movements.map((movement) => ({
    label: movement.type,
    value: Number(movement._sum.quantity_in_base_unit ?? 0),
  }));

  // The newest approved count per branch is the current
  // truth; older counts described stock that has since
  // moved, so their variances are history, not findings.
  const latestCountPerBranch = new Map<string, string>();
  for (const count of approvedCounts) {
    if (!latestCountPerBranch.has(count.branch_id)) {
      latestCountPerBranch.set(count.branch_id, count.id);
    }
  }
  const latestCountIds = [...latestCountPerBranch.values()];

  let discrepancies: InventoryDiscrepancy[] = [];
  if (latestCountIds.length > 0) {
    const items = await prisma.dunda_stock_count_items.findMany({
      where: { stock_count_id: { in: latestCountIds } },
      select: { product_id: true, variance: true },
    });
    const withVariance = items.filter(
      (item) => item.variance !== null && Number(item.variance) !== 0,
    );
    const productIds = [...new Set(withVariance.map((item) => item.product_id))];
    const productsNamed = await prisma.dunda_products.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, unit: true },
    });
    const productById = new Map(productsNamed.map((product) => [product.id, product]));
    discrepancies = withVariance.map((item) => {
      const product = productById.get(item.product_id);
      return {
        productId: item.product_id,
        name: product?.name ?? null,
        variance: Number(item.variance),
        unit: product?.unit ?? null,
      };
    });
  }

  return {
    totalItems,
    stockValue,
    belowReorder,
    outOfStock,
    byMovement,
    discrepancies,
  };
}

export interface SalesReport {
  dateFrom: string;
  dateTo: string;
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  byPaymentMethod: Array<{ label: string; value: number }>;
  byHour: Array<{ label: string; value: number }>;
}

export interface ProductReportItem {
  name: string;
  category: string;
  quantitySold: number;
  revenue: number;
}

export interface StaffReportItem {
  staffId: string | null;
  name: string;
  orders: number;
  revenue: number;
  averageOrderValue: number;
}

export interface TableReportItem {
  id: string;
  name: string;
  section: string;
  seats: number;
  status: string;
  revenue: number;
  covers: number;
  averageStayMinutes: number;
}

export interface PaymentReport {
  total: number;
  refunded: number;
  byMethod: Array<{ label: string; value: number; count: number }>;
}

export interface EventReportItem {
  id: string;
  name: string;
  date: string;
  capacity: number;
  status: string;
  reservations: number;
  guests: number;
  revenue: number;
  utilisation: number;
}

/** The window the client asks about, as UTC bounds. */
function windowBounds(dateFrom: string, dateTo: string): { start: Date; end: Date } {
  return {
    start: new Date(`${dateFrom}T00:00:00Z`),
    end: new Date(`${dateTo}T24:00:00Z`),
  };
}

/** An hour of the day as a till operator reads it. */
function hourLabel(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

/**
 * Sales over a window. Revenue is money that arrived — payments
 * that were not voided — while orders counts the completed ones,
 * so the average order value reads as the till does.
 */
export async function getSalesReport(
  organizationId: string,
  branchId: string | null,
  dateFrom: string,
  dateTo: string,
): Promise<SalesReport> {
  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });
  const { start, end } = windowBounds(dateFrom, dateTo);

  const [payments, orders] = await Promise.all([
    prisma.dunda_payments.findMany({
      where: { ...scope, paid_at: { gte: start, lt: end }, status: { not: "VOIDED" } },
      select: { amount: true, method: true, paid_at: true },
    }),
    prisma.dunda_orders.findMany({
      where: { ...scope, created_at: { gte: start, lt: end }, status: "COMPLETED" },
      select: { id: true },
    }),
  ]);

  const totalRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalOrders = orders.length;

  const byMethod = new Map<string, number>();
  const byHour = new Map<number, number>();
  for (const payment of payments) {
    byMethod.set(payment.method, (byMethod.get(payment.method) ?? 0) + payment.amount);
    const hour = payment.paid_at.getUTCHours();
    byHour.set(hour, (byHour.get(hour) ?? 0) + payment.amount);
  }

  return {
    dateFrom,
    dateTo,
    totalRevenue,
    totalOrders,
    averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    byPaymentMethod: [...byMethod.entries()].map(([label, value]) => ({ label, value })),
    byHour: [...byHour.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, value]) => ({ label: hourLabel(hour), value })),
  };
}

/** What sold over a window, by product, best earners first. */
export async function getProductReport(
  organizationId: string,
  branchId: string | null,
  dateFrom: string,
  dateTo: string,
): Promise<ProductReportItem[]> {
  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });
  const { start, end } = windowBounds(dateFrom, dateTo);

  const items = await prisma.dunda_order_items.groupBy({
    by: ["product_id", "name"],
    where: { dunda_orders: { ...scope, created_at: { gte: start, lt: end } } },
    _sum: { quantity: true, total: true },
    orderBy: { _sum: { total: "desc" } },
  });

  const productIds = [...new Set(items.map((item) => item.product_id))];
  const products = await prisma.dunda_products.findMany({
    where: { id: { in: productIds } },
    select: { id: true, category: true },
  });
  const categoryById = new Map(products.map((product) => [product.id, product.category]));

  return items.map((item) => ({
    name: item.name,
    category: categoryById.get(item.product_id) ?? "Uncategorized",
    quantitySold: Number(item._sum.quantity ?? 0),
    revenue: Number(item._sum.total ?? 0),
  }));
}

/** Completed orders attributed to the staff member who served them. */
export async function getStaffReport(
  organizationId: string,
  branchId: string | null,
): Promise<StaffReportItem[]> {
  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });

  const orders = await prisma.dunda_orders.findMany({
    where: { ...scope, status: "COMPLETED" },
    select: { staff_id: true, total: true },
  });

  const byStaff = new Map<string | null, { orders: number; revenue: number }>();
  for (const order of orders) {
    const entry = byStaff.get(order.staff_id) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += order.total;
    byStaff.set(order.staff_id, entry);
  }

  const staffIds = [...byStaff.keys()].filter((id): id is string => id !== null);
  const staff = staffIds.length > 0
    ? await prisma.dunda_staff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(staff.map((member) => [member.id, member.name]));

  return [...byStaff.entries()].map(([staffId, totals]) => ({
    staffId,
    name: staffId ? (nameById.get(staffId) ?? "Unknown") : "No staff",
    orders: totals.orders,
    revenue: totals.revenue,
    averageOrderValue: totals.orders > 0 ? Math.round(totals.revenue / totals.orders) : 0,
  }));
}

/**
 * Tables and the trade they saw. A settled tab is one party, so
 * covers counts parties rather than guessing at headcounts, and
 * the stay is measured from when the tab opened to when it closed.
 */
export async function getTableReport(
  organizationId: string,
  branchId: string | null,
): Promise<TableReportItem[]> {
  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });

  const [tables, settledTabs] = await Promise.all([
    prisma.dunda_tables.findMany({
      where: scope,
      select: { id: true, name: true, section: true, seats: true, status: true },
    }),
    prisma.dunda_tabs.findMany({
      where: { ...scope, status: { in: ["CLOSED", "SETTLED"] } },
      select: { table_id: true, total: true, opened_at: true, closed_at: true },
    }),
  ]);

  const byTable = new Map<string, { revenue: number; covers: number; stayMinutes: number[] }>();
  for (const tab of settledTabs) {
    if (!tab.table_id || !tab.closed_at) continue;
    const entry = byTable.get(tab.table_id) ?? { revenue: 0, covers: 0, stayMinutes: [] };
    entry.revenue += tab.total;
    entry.covers += 1;
    entry.stayMinutes.push((tab.closed_at.getTime() - tab.opened_at.getTime()) / 60000);
    byTable.set(tab.table_id, entry);
  }

  return tables.map((table) => {
    const stats = byTable.get(table.id);
    const stayMinutes = stats?.stayMinutes ?? [];
    return {
      id: table.id,
      name: table.name,
      section: table.section || "Unassigned",
      seats: table.seats,
      status: table.status,
      revenue: stats?.revenue ?? 0,
      covers: stats?.covers ?? 0,
      averageStayMinutes: stayMinutes.length > 0
        ? Math.round(stayMinutes.reduce((sum, minutes) => sum + minutes, 0) / stayMinutes.length)
        : 0,
    };
  });
}

/** Money taken, money returned, and the mix of ways it arrived. */
export async function getPaymentReport(
  organizationId: string,
  branchId: string | null,
): Promise<PaymentReport> {
  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });

  const [payments, refunds] = await Promise.all([
    prisma.dunda_payments.findMany({
      where: { ...scope, status: { not: "VOIDED" } },
      select: { amount: true, method: true },
    }),
    prisma.dunda_refunds.findMany({
      where: scope,
      select: { amount: true },
    }),
  ]);

  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const refunded = refunds.reduce((sum, refund) => sum + refund.amount, 0);

  const byMethod = new Map<string, { value: number; count: number }>();
  for (const payment of payments) {
    const entry = byMethod.get(payment.method) ?? { value: 0, count: 0 };
    entry.value += payment.amount;
    entry.count += 1;
    byMethod.set(payment.method, entry);
  }

  return {
    total,
    refunded,
    byMethod: [...byMethod.entries()].map(([label, stats]) => ({
      label,
      value: stats.value,
      count: stats.count,
    })),
  };
}

/** Events and how full they ran, from the reservations they drew. */
export async function getEventReport(
  organizationId: string,
  branchId: string | null,
): Promise<EventReportItem[]> {
  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });

  const events = await prisma.dunda_events.findMany({
    where: scope,
    orderBy: { date: "asc" },
    select: {
      id: true,
      name: true,
      date: true,
      capacity: true,
      status: true,
      revenue: true,
      dunda_event_reservations: { select: { guests: true } },
    },
  });

  return events.map((event) => {
    const guests = event.dunda_event_reservations.reduce((sum, reservation) => sum + reservation.guests, 0);
    return {
      id: event.id,
      name: event.name,
      date: event.date,
      capacity: event.capacity,
      status: event.status,
      reservations: event.dunda_event_reservations.length,
      guests,
      revenue: event.revenue,
      utilisation: event.capacity > 0 ? Math.round((guests / event.capacity) * 100) : 0,
    };
  });
}
