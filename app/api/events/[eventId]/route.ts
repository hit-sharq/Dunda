import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/** One event with its ticket sales, guest list and takings. */
export const GET = route(
  async (request: Request, context: { params: Promise<{ eventId: string }> }) => {
    const session = await requirePermission("manage_events");
    const organizationId = session.organizationId as string;
    const { eventId } = await context.params;

    const event = await prisma.dunda_events.findFirst({
      where: orgWhere(organizationId, { id: eventId }),
      include: {
        _count: { select: { dunda_event_tickets: true, dunda_event_guest_list: true } },
        dunda_event_tickets: {
          select: { id: true, status: true, amount: true, quantity: true, checked_in_at: true },
        },
        dunda_branches: { select: { id: true, name: true } },
      },
    });

    if (!event) throw notFound("That event");

    const sold = event.dunda_event_tickets.filter((t) => t.status === "ISSUED");
    const checkedIn = sold.filter((t) => t.checked_in_at !== null);

    return NextResponse.json({
      id: event.id,
      name: event.name,
      description: event.description,
      date: event.date,
      startTime: event.start_time,
      endTime: event.end_time,
      startsAt: `${event.date}T${event.start_time}`,
      endsAt: `${event.date}T${event.end_time}`,
      capacity: event.capacity,
      ticketPrice: event.ticket_price,
      status: event.status,
      branch: event.dunda_branches,
      ticketsSold: sold.reduce((sum, ticket) => sum + ticket.quantity, 0),
      ticketsPending: event.dunda_event_tickets
        .filter((ticket) => ticket.status === "PENDING_PAYMENT")
        .reduce((sum, ticket) => sum + ticket.quantity, 0),
      ticketsCheckedIn: checkedIn.length,
      guestList: event._count.dunda_event_guest_list,
      revenue: sold.reduce((sum, t) => sum + t.amount, 0),
    });
  },
);
