import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";


export const GET = route(async () => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const roles = await prisma.dunda_roles.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      is_owner: true,
      sort_order: true,
      _count: { select: { dunda_staff: true } },
    },
    orderBy: { sort_order: "asc" },
  });

  return NextResponse.json(
    roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isOwner: r.is_owner,
      grantable: !r.is_owner,
      staffOnThisRole: r._count.dunda_staff,
    })),
  );
});