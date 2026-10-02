import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * What has happened on the floor, most recent first.
 *
 * Reads the transaction tables rather than the activity log, so what the dashboard
 * shows and what the club actually took are the same rows. Each event carries the
 * type the client groups by.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const requested = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(requested) ? Math.min(Math.max(1, requested), 50) : 20;

  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });

  const [payments, orders, reservations, stockAlerts] = await Promise.all([
    prisma.dunda_payments.findMany({
      where: { ...scope, status: { not: "VOIDED" } },
      orderBy: { paid_at: "desc" },
      take: limit,
      select: { id: true, amount: true, method: true, paid_at: true },
    }),
    prisma.dunda_orders.findMany({
      where: { ...scope, created_at: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      orderBy: { created_at: "desc" },
      take: limit,
      select: { id: true, number: true, total: true, status: true, created_at: true },
    }),
    prisma.dunda_reservations.findMany({
      where: orgWhere(organizationId, {
        branch_id: branchId ?? undefined,
        starts_at: { gte: new Date() },
        status: { in: ["PENDING", "CONFIRMED"] },
      }),
      orderBy: { starts_at: "asc" },
      take: limit,
      select: { id: true, customer: true, table_name: true, starts_at: true, guests: true },
    }),
    prisma.dunda_inventory_alerts.findMany({
      where: { ...scope, severity: "OUT" },
      orderBy: { created_at: "desc" },
      take: limit,
      select: { id: true, name: true, created_at: true },
    }),
  ]);

  const items = [
    ...payments.map((p) => ({
      id: `payment_${p.id}`,
      type: "PAYMENT" as const,
      title: `Payment · ${p.method}`,
      detail: `Taken at the till`,
      amount: p.amount,
      timestamp: p.paid_at.toISOString(),
    })),
    ...orders.map((o) => ({
      id: `order_${o.id}`,
      type: "ORDER" as const,
      title: `Order ${o.number}`,
      detail: o.status.toLowerCase().replace(/_/g, " "),
      amount: o.total,
      timestamp: o.created_at.toISOString(),
    })),
    ...reservations.map((r) => ({
      id: `reservation_${r.id}`,
      type: "RESERVATION" as const,
      title: `Booking · ${r.table_name}`,
      detail: `${r.customer} · ${r.guests} guests`,
      amount: null,
      timestamp: r.starts_at.toISOString(),
    })),
    ...stockAlerts.map((a) => ({
      id: `inventory_${a.id}`,
      type: "INVENTORY" as const,
      title: `Out of stock · ${a.name}`,
      detail: "Nothing left on the shelf",
      amount: null,
      timestamp: a.created_at.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);

  return NextResponse.json(items);
});
