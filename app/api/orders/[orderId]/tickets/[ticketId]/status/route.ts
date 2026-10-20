import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  route,
  requireSession,
  orgWhere,
  parseBody,
} from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

const TICKET_STATUSES = ["PENDING", "READY", "SERVED", "CANCELLED"] as const;

const updateTicketStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES as unknown as [string, ...string[]]),
});

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ orderId: string; ticketId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { orderId, ticketId } = await context.params;

    const input = await parseBody(updateTicketStatusSchema, request);

    const ticket: any = await prisma.dunda_order_tickets.findFirst({
      where: orgWhere(organizationId, { id: ticketId, order_id: orderId }),
      select: { id: true, status: true, order_id: true, number: true },
    });
    if (!ticket) {
      throw notFound("That ticket");
    }

    const TRANSITIONS: Record<string, string[]> = {
      PENDING: ["READY", "CANCELLED"],
      READY: ["SERVED", "CANCELLED"],
      SERVED: [],
      CANCELLED: [],
    };

    const allowed = TRANSITIONS[ticket.status];
    if (!allowed || !allowed.includes(input.status)) {
      throw wrongState(
        `A ticket that is ${ticket.status.toLowerCase()} cannot become ${input.status.toLowerCase()}.`,
      );
    }

    const updated = await prisma.dunda_order_tickets.update({
      where: { id: ticketId },
      data: { status: input.status },
      select: { id: true, station: true, number: true, status: true, updated_at: true },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
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
      station: updated.station,
      number: updated.number,
      status: updated.status,
      updated_at: updated.updated_at.toISOString(),
    });
  },
);
