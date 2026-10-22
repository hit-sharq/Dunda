import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/** The kitchen and bar tickets raised on one tab. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ tabId: string }> }) => {
    const session = await requirePermission("view_orders");
    const organizationId = session.organizationId as string;
    const { tabId } = await context.params;

    const tab = await prisma.dunda_tabs.findFirst({
      where: orgWhere(organizationId, { id: tabId }),
      select: { id: true, number: true, table_name: true },
    });
    if (!tab) throw notFound("That tab");

    const tickets = await prisma.dunda_order_tickets.findMany({
      where: { tab_id: tab.id },
      orderBy: { created_at: "asc" },
      include: {
        dunda_order_ticket_items: {
          select: { id: true, name: true, quantity: true, notes: true },
        },
      },
    });

    return NextResponse.json({
      tabId: tab.id,
      tabNumber: tab.number,
      tickets: tickets.map((t) => ({
        id: t.id,
        number: t.number,
        orderId: t.order_id ?? "",
        orderNumber: null,
        table: tab.table_name,
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
