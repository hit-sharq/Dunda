import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requirePermission, orgWhere } from "@/lib/server/http";
import { startSession, currentRate } from "@/lib/server/pool";

export const dynamic = "force-dynamic";

/**
 * The pool area: every table, its state, and what the running game owes.
 *
 * The rate shown comes from the rule that applies now, read from the database. A
 * screen that hardcoded a price would quietly disagree with the receipt.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const tables = await prisma.dunda_pool_tables.findMany({
    where: orgWhere(organizationId, branchId ? { branch_id: branchId } : undefined),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      branch_id: true,
      base_rate: true,
      minimum_minutes: true,
      rounding_minutes: true,
      notes: true,
    },
  });

  const rules = await prisma.dunda_pool_rate_rules.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      active: true,
    }),
    select: {
      id: true,
      pool_table_id: true,
      name: true,
      weekday: true,
      start_minute: true,
      end_minute: true,
      hourly_rate: true,
      minimum_minutes: true,
      rounding_minutes: true,
      rounding_mode: true,
    },
  });

  const sessions = await prisma.dunda_pool_sessions.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      status: { in: ["ACTIVE", "PAUSED"] },
    }),
    include: {
      dunda_customers: { select: { id: true, name: true } },
      dunda_tabs: { select: { id: true, number: true, outstanding: true } },
    },
  });

  const byTable = new Map(sessions.map((s) => [s.pool_table_id, s]));

  // The rule in force right now is resolved per table, so a pool area with
  // peak and off-peak pricing shows the right number on each row.
  const now = new Date();
  const resolved = await Promise.all(
    tables.map(async (table) => {
      const { rule } = await currentRate(organizationId, table.branch_id, table.id, now);
      const session = byTable.get(table.id);
      return {
        id: table.id,
        name: table.name,
        status: table.status,
        notes: table.notes,
        rate: rule?.hourlyRate ?? table.base_rate,
        rateRuleName: rule?.name ?? null,
        minimumMinutes: rule?.minimumMinutes ?? table.minimum_minutes,
        roundingMinutes: rule?.roundingMinutes ?? table.rounding_minutes,
        hasRate: Boolean(rule) || table.base_rate > 0,
        session: session
          ? {
              id: session.id,
              status: session.status,
              tabId: session.tab_id,
              tabNumber: session.dunda_tabs?.number ?? null,
              customerName: session.dunda_customers?.name ?? null,
              startedAt: session.started_at.toISOString(),
              pausedAt: session.paused_at?.toISOString() ?? null,
              elapsedSeconds:
                Math.floor(
                  ((session.paused_at ?? now).getTime() - session.started_at.getTime()) / 1000,
                ) - session.paused_seconds,
              rate: session.hourly_rate,
              accrued: accrued(session, now),
            }
          : null,
      };
    }),
  );

  return NextResponse.json({ tables: resolved, rules });
});

function accrued(
  session: {
    started_at: Date;
    paused_at: Date | null;
    paused_seconds: number;
    hourly_rate: number;
  },
  now: Date,
): number {
  const running = session.paused_at ?? now;
  const seconds =
    Math.floor((running.getTime() - session.started_at.getTime()) / 1000) -
    session.paused_seconds;
  return Math.round((Math.max(0, Math.floor(seconds / 60)) * session.hourly_rate) / 60);
}

/** Starts a game. Refused when the table is busy, reserved or has no rate. */
export const POST = route(async (request: Request) => {
  const session = await requirePermission("manage_floor");
  const organizationId = session.organizationId as string;

  const body = (await request.json().catch(() => ({}))) as {
    poolTableId?: string;
    tabId?: string | null;
    customerId?: string | null;
  };

  if (!body.poolTableId) {
    return NextResponse.json(
      { error: "Which pool table?", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const table = await prisma.dunda_pool_tables.findFirst({
    where: orgWhere(organizationId, { id: body.poolTableId }),
    select: { id: true, branch_id: true },
  });
  if (!table) {
    return NextResponse.json(
      { error: "That pool table is not part of this club.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const created = await startSession({
    organizationId,
    branchId: table.branch_id,
    poolTableId: table.id,
    tabId: body.tabId ?? null,
    customerId: body.customerId ?? null,
    staffId: session.staffId,
  });

  return NextResponse.json(
    { id: created.id, status: created.status, startedAt: created.started_at.toISOString() },
    { status: 201 },
  );
});
