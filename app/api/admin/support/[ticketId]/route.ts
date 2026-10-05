import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  route,
  Forbidden,
  NotProvisioned,
  resolveSession,
  parseBody,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";

const updateTicketSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "CLOSED"]),
  resolution: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
});

/**
 * Moves a support ticket along.
 *
 * Closing one records a resolution and the moment it was resolved, because a
 * support log that says something was closed without saying how is not worth
 * keeping.
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ ticketId: string }> }) => {
    const session = await resolveSession();
    if (!session) throw new NotProvisioned();
    if (!session.isOperator) throw new Forbidden("platform_console");

    const { ticketId } = await context.params;
    const input = await parseBody(updateTicketSchema, request);

    const existing = await prisma.dunda_support_tickets.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, subject: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "That ticket no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const closing = input.status === "CLOSED";
    const ticket = await prisma.dunda_support_tickets.update({
      where: { id: ticketId },
      data: {
        status: input.status,
        ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
        ...(input.assignedToId !== undefined
          ? { assigned_to_id: input.assignedToId }
          : {}),
        // Stamped when closed and cleared if reopened, so an open ticket never
        // carries a resolution date implying it was dealt with.
        resolved_at: closing ? new Date() : null,
      },
      select: {
        id: true,
        subject: true,
        status: true,
        resolution: true,
        resolved_at: true,
      },
    });

    await prisma.dunda_platform_audit_logs.create({
      data: {
        actor_clerk_user_id: session.clerkUserId,
        organization_id: null,
        action: "UPDATE",
        entity: "support_ticket",
        entity_id: ticketId,
        detail: `${ticket.subject} moved to ${ticket.status}`,
        previous_value: { status: existing.status },
        new_value: { status: ticket.status, resolution: ticket.resolution },
      },
    });

    return NextResponse.json({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      resolution: ticket.resolution,
      resolvedAt: ticket.resolved_at?.toISOString() ?? null,
    });
  },
);
