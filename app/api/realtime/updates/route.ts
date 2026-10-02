import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requirePermission } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Feeds the operational screens that must update without a refresh: the floor,
 * the pool area, the bar display and the dashboard.
 *
 * A long poll rather than a socket. The till and the kitchen are on tablets that
 * sleep, and a poll that reconnects on its own survives that where a dropped
 * websocket quietly stops delivering. `updatedAfter` lets a screen ask for only
 * what it has not seen.
 */
export const GET = route(async (request: Request) => {
  const session = await requirePermission("view_pos");
  const organizationId = session.organizationId as string;

  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const since = sinceParam ? new Date(sinceParam) : null;

  // A client that passes a timestamp from the future — a clock drift, or a
  // corrupted value — would sit waiting for changes that have already happened.
  const after = since && !Number.isNaN(since.getTime()) && since.getTime() <= Date.now()
    ? since
    : new Date(Date.now() - 5000);

  const scope = { organization_id: organizationId, ...(branchId ? { branch_id: branchId } : {}) };

  const [orders, tabs, payments, poolSessions, tables, reservations] = await Promise.all([
    prisma.dunda_orders.findMany({
      where: { ...scope, updated_at: { gt: after } },
      select: { id: true, number: true, status: true, updated_at: true },
      take: 50,
    }),
    // Tabs carry no updated_at, so a change is detected by re-reading the ones
    // that are open or unsettled. That is also exactly the set a floor screen
    // cares about, so nothing is missed by not tracking the rest.
    prisma.dunda_tabs.findMany({
      where: {
        organization_id: organizationId,
        ...(branchId ? { branch_id: branchId } : {}),
        status: { in: ["OPEN", "SETTLED", "ON_ACCOUNT"] },
      },
      select: { id: true, number: true, status: true, total: true, outstanding: true },
      take: 100,
    }),
    prisma.dunda_payments.findMany({
      where: { ...scope, paid_at: { gt: after } },
      select: { id: true, amount: true, method: true, paid_at: true },
      take: 50,
    }),
    // Live sessions always come back because their charge is still accruing;
    // finished ones only when they finished since the client last looked.
    prisma.dunda_pool_sessions.findMany({
      where: {
        ...scope,
        OR: [{ status: { in: ["ACTIVE", "PAUSED"] } }, { ended_at: { gt: after } }],
      },
      select: {
        id: true,
        pool_table_id: true,
        tab_id: true,
        status: true,
        started_at: true,
        paused_at: true,
        paused_seconds: true,
        hourly_rate: true,
        charge: true,
        ended_at: true,
      },
      take: 50,
    }),
    prisma.dunda_tables.findMany({
      where: { ...scope, status: { in: ["OCCUPIED", "AVAILABLE", "PAYMENT_PENDING"] } },
      select: { id: true, name: true, section: true, status: true, customer: true, total: true, tab_id: true },
      take: 100,
    }),
    prisma.dunda_reservations.findMany({
      where: { ...scope, starts_at: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
      select: { id: true, customer: true, table_name: true, starts_at: true, ends_at: true, status: true },
      take: 50,
    }),
  ]);

  // The newest change is when the client should poll from next. Sent as a value
  // rather than "now", because a change that lands during this request would
  // otherwise be skipped.
  const stamps = [
    ...orders.map((o) => o.updated_at.getTime()),
    ...payments.map((p) => p.paid_at.getTime()),
    ...poolSessions.map((s) => (s.ended_at ?? new Date()).getTime()),
  ];
  const watermark = stamps.length > 0 ? new Date(Math.max(...stamps)) : new Date();

  return NextResponse.json({
    watermark: watermark.toISOString(),
    // The pool charge runs continuously, so the elapsed time is computed here
    // rather than left for each screen to work out for itself.
    serverTime: new Date().toISOString(),
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      updatedAt: o.updated_at.toISOString(),
    })),
    tabs: tabs.map((t) => ({
      id: t.id,
      number: t.number,
      status: t.status,
      total: t.total,
      outstanding: t.outstanding,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      paidAt: p.paid_at.toISOString(),
    })),
    poolSessions: poolSessions.map((s) => {
      const running = s.status === "PAUSED" ? s.paused_at : new Date();
      const seconds =
        Math.floor(((running ?? new Date()).getTime() - s.started_at.getTime()) / 1000) -
        s.paused_seconds;
      return {
        id: s.id,
        poolTableId: s.pool_table_id,
        tabId: s.tab_id,
        status: s.status,
        elapsedSeconds: Math.max(0, seconds),
        rate: s.hourly_rate,
        accrued: Math.round((Math.max(0, Math.floor(seconds / 60)) * s.hourly_rate) / 60),
        endedAt: s.ended_at?.toISOString() ?? null,
      };
    }),
    tables: tables.map((t) => ({
      id: t.id,
      name: t.name,
      section: t.section,
      status: t.status,
      customer: t.customer,
      total: t.total,
      tabId: t.tab_id,
    })),
    reservations: reservations.map((r) => ({
      id: r.id,
      customer: r.customer,
      table: r.table_name,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      status: r.status,
    })),
  });
});
