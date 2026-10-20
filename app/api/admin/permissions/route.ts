import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const session = await requireSession();

  const permissions = await prisma.dunda_permissions.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      _count: { select: { dunda_role_permissions: true } },
    },
  });

  return NextResponse.json(
    permissions.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      rolesUsing: p._count.dunda_role_permissions,
    })),
  );
});
