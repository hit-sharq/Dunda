import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { TRANSACTION_OPTIONS } from "@/lib/db/transaction";
import { conflict, moneyRule } from "@/lib/errors.server";
import { requireModule, requirePermission, route } from "@/lib/server/http";
import { initiateClubResourcePayment } from "@/lib/server/payments";

export const dynamic = "force-dynamic";

const saleSchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  ticketType: z.string().trim().min(1).max(40).default("GENERAL"),
  quantity: z.number().int().min(1).max(20),
  method: z.enum(["CASH", "MPESA", "CARD", "BANK_TRANSFER"]).default("MPESA"),
});

export const GET = route(async (_request: Request, context: { params: Promise<{ eventId: string }> }) => {
  const session = await requirePermission("manage_events");
  const organizationId = session.organizationId as string;
  await requireModule(organizationId, "events");
  const { eventId } = await context.params;
  const tickets = await prisma.dunda_event_tickets.findMany({
    where: { organization_id: organizationId, event_id: eventId },
    orderBy: { sold_at: "desc" },
    take: 200,
    select: {
      id: true,
      code: true,
      guest_name: true,
      phone: true,
      ticket_type: true,
      price: true,
      quantity: true,
      amount: true,
      status: true,
      sold_at: true,
    },
  });
  return NextResponse.json(tickets.map((ticket) => ({
    id: ticket.id,
    code: ticket.code,
    guestName: ticket.guest_name,
    phone: ticket.phone,
    ticketType: ticket.ticket_type,
    price: ticket.price,
    quantity: ticket.quantity,
    amount: ticket.amount,
    status: ticket.status,
    soldAt: ticket.sold_at.toISOString(),
  })));
});

export const POST = route(async (request: Request, context: { params: Promise<{ eventId: string }> }) => {
  const session = await requirePermission("manage_events");
  const organizationId = session.organizationId as string;
  await requireModule(organizationId, "events");
  const { eventId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Ticket details are invalid.", code: "VALIDATION_FAILED" }, { status: 422 });
  }

  const total = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "dunda_events"
      WHERE "id" = ${eventId} AND "organization_id" = ${organizationId}
      FOR UPDATE
    `);
    const event = await tx.dunda_events.findFirst({
      where: { id: eventId, organization_id: organizationId },
      select: { id: true, branch_id: true, name: true, capacity: true, ticket_price: true, status: true },
    });
    if (!event) return null;
    if (!(["UPCOMING", "LIVE"] as string[]).includes(event.status)) {
      throw conflict("Tickets can only be sold for upcoming or live events.");
    }

    const sold = await tx.dunda_event_tickets.aggregate({
      where: {
        organization_id: organizationId,
        event_id: eventId,
        status: { in: ["ISSUED", "PENDING_PAYMENT"] },
      },
      _sum: { quantity: true },
    });
    const allocated = sold._sum.quantity ?? 0;
    if (event.capacity > 0 && allocated + parsed.data.quantity > event.capacity) {
      throw conflict(`Only ${Math.max(0, event.capacity - allocated)} tickets remain.`);
    }

    const amount = event.ticket_price * parsed.data.quantity;
    if (!Number.isSafeInteger(amount) || amount > 2_147_483_647) {
      throw moneyRule("That ticket quantity exceeds the supported total.");
    }

    const ticket = await tx.dunda_event_tickets.create({
      data: {
        organization_id: organizationId,
        branch_id: event.branch_id,
        event_id: event.id,
        code: randomBytes(6).toString("hex").toUpperCase(),
        guest_name: parsed.data.guestName,
        phone: parsed.data.phone ?? null,
        ticket_type: parsed.data.ticketType,
        price: event.ticket_price,
        quantity: parsed.data.quantity,
        amount,
        status: amount === 0 || parsed.data.method === "CASH" ? "ISSUED" : "PENDING_PAYMENT",
      },
    });

    let paymentId: string | null = null;
    if (amount > 0 && parsed.data.method === "CASH") {
      const payment = await tx.dunda_payments.create({
        data: {
          organization_id: organizationId,
          branch_id: event.branch_id,
          event_ticket_id: ticket.id,
          amount,
          currency: "KES",
          method: "CASH",
          cashier_id: session.staffId,
          idempotency_key: `event-ticket:${ticket.id}`,
        },
        select: { id: true },
      });
      paymentId = payment.id;
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: event.branch_id,
        staff_id: session.staffId,
        action: "CREATE",
        entity: "event_ticket",
        entity_id: ticket.id,
        detail: `${ticket.quantity} ${ticket.ticket_type} ticket(s) for ${event.name}`,
      },
    });
    return { event, ticket, amount, paymentId };
  }, { ...TRANSACTION_OPTIONS, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!total) return NextResponse.json({ error: "That event is not part of this club.", code: "NOT_FOUND" }, { status: 404 });
  if (total.amount === 0 || parsed.data.method === "CASH") {
    return NextResponse.json({
      status: "ISSUED",
      ticket: { id: total.ticket.id, code: total.ticket.code, quantity: total.ticket.quantity },
      paymentId: total.paymentId,
      amount: total.amount,
    }, { status: 201 });
  }

  try {
    const payment = await initiateClubResourcePayment({
      organizationId,
      branchId: total.event.branch_id,
      eventTicketId: total.ticket.id,
      amount: total.amount,
      method: parsed.data.method,
      description: `${total.ticket.quantity} ${total.ticket.ticket_type} ticket(s) for ${total.event.name}`,
      payerEmail: parsed.data.email,
      payerPhone: parsed.data.phone,
      payerName: parsed.data.guestName,
    });
    return NextResponse.json({
      status: "PENDING_PAYMENT",
      ticketId: total.ticket.id,
      quantity: total.ticket.quantity,
      amount: total.amount,
      currency: payment.currency,
      attemptId: payment.attemptId,
      redirectUrl: payment.redirectUrl,
    }, { status: 201 });
  } catch (error) {
    await prisma.dunda_event_tickets.updateMany({
      where: { id: total.ticket.id, organization_id: organizationId, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED" },
    });
    throw error;
  }
});