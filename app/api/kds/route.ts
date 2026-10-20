import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const station = url.searchParams.get("station"); // "BAR" | "KITCHEN"

  const tickets = await prisma.dunda_order_tickets.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      station: station ?? undefined,
      status: { in: ["PENDING", "READY"] },
    }),
    orderBy: { created_at: "asc" },
      select: {
        id: true,
        number: true,
        station: true,
        status: true,
        notes: true,
        created_at: true,
        updated_at: true,
        dunda_orders: {
          select: {
            id: true,
            number: true,
            table_name: true,
            subtotal: true,
            total: true,
            dunda_order_items: {
              select: {
                id: true,
                name: true,
                quantity: true,
                unit_price: true,
                total: true,
                notes: true,
              },
            },
          },
        },
      },
  });

  // Group by station
  const byStation: Record<string, any[]> = {};
  for (const ticket of tickets) {
    const st = ticket.station || "BAR";
    if (!byStation[st]) byStation[st] = [];
    byStation[st].push(ticket);
  }

  return NextResponse.json(byStation);
});
