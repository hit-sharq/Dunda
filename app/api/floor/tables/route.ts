import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";
import { getTenantSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/**
 * Every table on the floor with its current state and what it is owed.
 *
 * The bill shown here is the tab's stored total, so the number on the floor
 * screen and the number on the receipt cannot disagree.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const tables = await prisma.dunda_tables.findMany({
    where: orgWhere(organizationId, branchId ? { branch_id: branchId } : undefined),
    orderBy: [{ section: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      section: true,
      seats: true,
      status: true,
      total: true,
      tab_id: true,
      customer: true,
      x: true,
      y: true,
      width: true,
      height: true,
    },
  });

  // Live sessions carry the running charge, so the attendant can answer "how much
  // so far" without ending the game.
  const sessions = await prisma.dunda_pool_sessions.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      status: { in: ["ACTIVE", "PAUSED"] },
    }),
    select: {
      id: true,
      pool_table_id: true,
      tab_id: true,
      status: true,
      started_at: true,
      paused_at: true,
      paused_seconds: true,
      hourly_rate: true,
    },
  });

  const settings = await getTenantSettings(organizationId);

  return NextResponse.json({
    tables: tables.map((t) => ({
      id: t.id,
      name: t.name,
      section: t.section,
      seats: t.seats,
      status: t.status,
      total: t.total,
      tabId: t.tab_id,
      customer: t.customer,
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      poolTableId: s.pool_table_id,
      tabId: s.tab_id,
      status: s.status,
      startedAt: s.started_at.toISOString(),
      pausedAt: s.paused_at?.toISOString() ?? null,
      elapsedSeconds:
        Math.floor(((s.paused_at ?? new Date()).getTime() - s.started_at.getTime()) / 1000) -
        s.paused_seconds,
      rate: s.hourly_rate,
      accrued: accruedPreview(s),
    })),
    currency: settings.currency,
  });
});

/**
 * The charge so far, at the same rate the session will settle at.
 *
 * Shown while the game is still running, so it is deliberately unrounded: this is
 * a "roughly this much so far" for the floor, not a figure the guest is charged.
 */
function accruedPreview(session: {
  started_at: Date;
  paused_at: Date | null;
  paused_seconds: number;
  hourly_rate: number;
}): number {
  const running = session.paused_at ?? new Date();
  const seconds =
    Math.floor((running.getTime() - session.started_at.getTime()) / 1000) -
    session.paused_seconds;
  const minutes = Math.max(0, Math.floor(seconds / 60));
  return Math.round((minutes * session.hourly_rate) / 60);
}
