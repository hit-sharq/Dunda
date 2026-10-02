import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * The club's branches with live floor counts.
 *
 * Occupied and total are derived from the tables and pool tables rather than held
 * on the branch row, because a counter that is only updated on some paths drifts.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);

  const branches = await prisma.dunda_branches.findMany({
    where: orgWhere(organizationId),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      city: true,
      address: true,
      status: true,
      timezone: true,
      phone: true,
      email: true,
    },
  });

  const counts = await Promise.all(
    branches.map(async (branch) => {
      const [tables, poolTables, activeSessions] = await Promise.all([
        prisma.dunda_tables.findMany({
          where: { organization_id: organizationId, branch_id: branch.id },
          select: { status: true },
        }),
        prisma.dunda_pool_tables.findMany({
          where: { organization_id: organizationId, branch_id: branch.id },
          select: { status: true },
        }),
        prisma.dunda_pool_sessions.count({
          where: {
            organization_id: organizationId,
            branch_id: branch.id,
            status: { in: ["ACTIVE", "PAUSED"] },
          },
        }),
      ]);

      const total = tables.length + poolTables.length;
      const active =
        tables.filter((t) => t.status === "OCCUPIED").length +
        poolTables.filter((t) => t.status === "OCCUPIED").length;

      return { branch, total, active, activeSessions };
    }),
  );

  return NextResponse.json(
    counts.map(({ branch, total, active, activeSessions }) => ({
      id: branch.id,
      name: branch.name,
      city: branch.city,
      address: branch.address,
      status: branch.status,
      timezone: branch.timezone,
      phone: branch.phone,
      email: branch.email,
      totalTables: total,
      activeTables: active,
      activeSessions,
    })),
  );
});
