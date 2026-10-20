import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const session = await requirePermission("view_reports");
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30)));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });

  const [totalAgg, byMethod, byDay, topItems, byStaff, orderCount, voidedAgg, byCategory] =
    await Promise.all([
      prisma.dunda_payments.aggregate({
        where: { ...scope, status: { not: "VOIDED" }, paid_at: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.dunda_payments.groupBy({
        by: ["method"],
        where: { ...scope, status: { not: "VOIDED" }, paid_at: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.dunda_payments.findMany({
        where: { ...scope, status: { not: "VOIDED" }, paid_at: { gte: since } },
        select: { amount: true, paid_at: true },
      }),
      prisma.dunda_order_items.groupBy({
        by: ["name"],
        where: {
          dunda_orders: { ...scope, created_at: { gte: since } },
        },
        _sum: { quantity: true, total: true },
        _count: true,
        orderBy: { _sum: { total: "desc" } },
        take: 15,
      }),
      prisma.dunda_payments.groupBy({
        by: ["cashier_id"],
        where: { ...scope, status: { not: "VOIDED" }, paid_at: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.dunda_orders.count({
        where: { ...scope, created_at: { gte: since } },
      }),
      prisma.dunda_payments.aggregate({
        where: { ...scope, status: "VOIDED", paid_at: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.dunda_order_items.groupBy({
        by: ["category_id"],
        where: { dunda_orders: { ...scope, created_at: { gte: since } } },
        _sum: { total: true },
        _count: true,
      }),
    ]);

  // Bucket payments by day
  const daily = new Map<string, { total: number; count: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    daily.set(d.toISOString().slice(0, 10), { total: 0, count: 0 });
  }
  for (const p of byDay) {
    const key = p.paid_at.toISOString().slice(0, 10);
    const bucket = daily.get(key);
    if (bucket) {
      bucket.total += p.amount;
      bucket.count += 1;
    }
  }

  // Resolve staff names for the cashier breakdown
  const staffIds = byStaff.map((s) => s.cashier_id).filter((id): id is string => Boolean(id));
  const staffRows = staffIds.length
    ? await prisma.dunda_staff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true },
      })
    : [];
  const staffName = new Map(staffRows.map((s) => [s.id, s.name]));

  // Category names
  const categoryIds = byCategory.map((c) => c.category_id).filter((id): id is string => Boolean(id));
  const categoryRows = categoryIds.length
    ? await prisma.dunda_categories.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
    : [];
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));

  const revenue = totalAgg._sum.amount ?? 0;
  const transactions = totalAgg._count;

  return NextResponse.json({
    window: { days, since: since.toISOString() },
    summary: {
      revenue,
      transactions,
      averageTicket: transactions > 0 ? Math.round(revenue / transactions) : 0,
      orders: orderCount,
      voidedAmount: voidedAgg._sum.amount ?? 0,
      voidedCount: voidedAgg._count,
    },
    byMethod: byMethod.map((m) => ({
      method: m.method,
      total: (m._sum?.amount ?? 0),
      count: m._count,
    })),
    byStaff: byStaff
      .map((s) => ({
        staffId: s.cashier_id,
        name: s.cashier_id ? staffName.get(s.cashier_id) ?? "Unknown" : "Walk-in",
        total: (s._sum?.amount ?? 0),
        count: s._count,
      }))
      .sort((a, b) => b.total - a.total),
    topItems: topItems.map((i) => ({
      name: i.name,
      quantity: (i._sum?.quantity ?? 0),
      total: (i._sum?.total ?? 0),
      orders: i._count,
    })),
    byCategory: byCategory
      .map((c) => ({
        categoryId: c.category_id,
        name: c.category_id ? categoryName.get(c.category_id) ?? "Other" : "Uncategorised",
        total: (c._sum?.total ?? 0),
        count: c._count,
      }))
      .sort((a, b) => b.total - a.total),
    daily: [...daily.entries()].map(([date, v]) => ({
      date,
      total: v.total,
      count: v.count,
    })),
  });
});
