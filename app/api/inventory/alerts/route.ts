import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requireModule, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";


export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  await requireModule(organizationId, "inventory");
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const alerts = await prisma.dunda_inventory_alerts.findMany({
    where: orgWhere(organizationId, branchId ? { branch_id: branchId } : undefined),
    
    
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
      
      
      severity: a.severity === "OUT" ? ("OUT" as const) : ("LOW" as const),
    })),
  );
});