import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const ticketQuerySchema = z.object({
  station: z.enum(["BAR", "KITCHEN"]),
  includeClosed: z.boolean().optional().default(false),
});

/**
 * The station ticket board. This is what the bar and kitchen displays read,
 * so a ticket only shows on the station that is responsible for it.
 */
export const GET = route(async (request: Request) => {
  const session = await requirePermission("update_ticket");
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);

  const parsed = ticketQuerySchema.safeParse({
    station: url.searchParams.get("station"),
    includeClosed: url.searchParams.get("includeClosed") === "true",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Say which station you are asking for.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const { station, includeClosed } = parsed.data;

  const tickets = await prisma.dunda_order_tickets.findMany({
    where: orgWhere(organizationId, {
      station,
      ...(includeClosed
        ? {}
        : { status: { in: ["PENDING", "ACCEPTED", "PREPARING", "READY"] } }),
    }),
    orderBy: { created_at: "asc" },
    include: {
      dunda_order_ticket_items: {
        select: {
          id: true,
          name: true,
          quantity: true,
          notes: true,
        },
      },
      dunda_orders: {
        select: {
          id: true,
          number: true,
          table_name: true,
          table_id: true,
        },
      },
    },
  });

  return NextResponse.json(
    tickets.map((t) => ({
      id: t.id,
      number: t.number,
      orderId: t.order_id ?? "",
      orderNumber: t.dunda_orders?.number ?? null,
      table: t.dunda_orders?.table_name ?? null,
      tableId: t.dunda_orders?.table_id ?? null,
      tabId: t.tab_id,
      station: t.station,
      status: t.status,
      notes: t.notes,
      createdAt: t.created_at.toISOString(),
      updatedAt: t.updated_at.toISOString(),
      items: t.dunda_order_ticket_items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        notes: i.notes,
      })),
    })),
  );
});
