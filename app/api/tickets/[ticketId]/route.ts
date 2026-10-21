import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const updateTicketSchema = z.object({
  status: z.enum(["ACCEPTED", "PREPARING", "READY", "SERVED", "CANCELLED"]),
});

const NEXT_STATUS: Record<string, string[]> = {
  PENDING: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: [],
  COMPLETED: [],
  CANCELLED: [],
  DRAFT: ["ACCEPTED", "CANCELLED"],
};

/**
 * Moves a ticket along at its station. The bar advances its own tickets and
 * the kitchen advances its own, so serving the drinks does not close the food.
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ ticketId: string }> }) => {
    checkRateLimit(clientIpKey(request), 120, 60 * 60 * 1000);

    const session = await requirePermission("update_ticket");
    const organizationId = session.organizationId as string;
    const { ticketId } = await context.params;

    const input = await parseBody(updateTicketSchema, request);

    const ticket: any = await prisma.dunda_order_tickets.findFirst({
      where: orgWhere(organizationId, { id: ticketId }),
      select: { id: true, status: true, station: true, number: true, order_id: true },
    });
    if (!ticket) throw notFound("That ticket");

    const allowed = NEXT_STATUS[ticket.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw wrongState(
        `A ticket that is ${ticket.status.toLowerCase()} cannot become ${input.status.toLowerCase()}.`,
      );
    }

    const updated: any = await prisma.dunda_order_tickets.update({
      where: { id: ticketId },
      data: { status: input.status },
      select: {
        id: true,
        number: true,
        order_id: true,
        station: true,
        status: true,
        notes: true,
        tab_id: true,
        created_at: true,
        updated_at: true,
        dunda_order_ticket_items: {
          select: { id: true, name: true, quantity: true, notes: true },
        },
        dunda_orders: {
          select: { id: true, number: true, table_name: true, table_id: true },
        },
      },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: null,
        staff_id: session.staffId,
        action: "UPDATE",
        entity: "order_ticket",
        entity_id: ticketId,
        detail: `Ticket ${ticket.number} moved to ${input.status}`,
        previous_value: { status: ticket.status },
        new_value: { status: input.status },
      },
    });

    return NextResponse.json({
      id: updated.id,
      number: updated.number,
      orderId: updated.order_id ?? "",
      orderNumber: updated.dunda_orders?.number ?? null,
      table: updated.dunda_orders?.table_name ?? null,
      tableId: updated.dunda_orders?.table_id ?? null,
      tabId: updated.tab_id,
      station: updated.station,
      status: updated.status,
      notes: updated.notes,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
      items: updated.dunda_order_ticket_items.map((i: any) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        notes: i.notes,
      })),
    });
  },
);
