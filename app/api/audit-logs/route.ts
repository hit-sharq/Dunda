import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * The club's own audit trail. The platform console reads
 * /api/admin/audit-logs, which is the platform-wide ledger and is only open
 * to operators. This is the club-level one, scoped to the signed-in
 * organisation, and is what the reports screen reads.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(requested) ? Math.min(Math.max(1, requested), 200) : 50;

  const entries = await prisma.dunda_audit_logs.findMany({
    where: orgWhere(organizationId),
    orderBy: { created_at: "desc" },
    take: limit,
    include: {
      dunda_staff: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      staffId: e.staff_id,
      staffName: e.dunda_staff?.name ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entity_id,
      detail: e.detail,
      reason: e.reason,
      createdAt: e.created_at.toISOString(),
    })),
  );
});
