import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requireModule, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Products that need restocking, worst first.
 *
 * The alert rows are rebuilt after every stock movement rather than kept current
 * by a job, so what a bartender sees is the quantity that is actually there.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  await requireModule(organizationId, "inventory");
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const alerts = await prisma.dunda_inventory_alerts.findMany({
    where: orgWhere(organizationId, branchId ? { branch_id: branchId } : undefined),
    // Out of stock is worse than low, so it sorts first regardless of how far
    // below the threshold each one is.
    orderBy: [{ severity: "desc" }, { stock: "asc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      category: true,
      stock: true,
      minimum: true,
      unit: true,
      severity: true,
    },
  });

  return NextResponse.json(
    alerts.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category ?? "",
      stock: Number(a.stock),
      minimum: Number(a.minimum),
      unit: a.unit ?? "piece",
      // Stored as text on the legacy schema; normalised here so the client's
      // severity union always holds.
      severity: a.severity === "OUT" ? ("OUT" as const) : ("LOW" as const),
    })),
  );
});
