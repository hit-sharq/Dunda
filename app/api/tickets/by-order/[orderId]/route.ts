import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/** The kitchen and bar tickets raised for one order. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ orderId: string }> }) => {
    const session = await requirePermission("view_orders");
    const organizationId = session.organizationId as string;
    const { orderId } = await context.params;

    const order = await prisma.dunda_orders.findFirst({
      where: orgWhere(organizationId, { id: orderId }),
      select: { id: true, number: true },
    });
    if (!order) throw notFound("That order");

    const tickets = await prisma.dunda_order_tickets.findMany({
      where: { order_id: order.id },
      orderBy: { created_at: "asc" },
      include: {
        dunda_order_ticket_items: {
          select: { id: true, name: true, quantity: true, notes: true },
        },
      },
    });

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.number,
      tickets: tickets.map((t) => ({
        id: t.id,
        number: t.number,
        orderId: t.order_id ?? "",
        orderNumber: order.number,
        table: null,
        tableId: null,
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
    });
  },
);
