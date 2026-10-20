import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const tables = await prisma.dunda_tables.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
    }),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      tab_id: true,
    },
  });

  return NextResponse.json(tables);
});
