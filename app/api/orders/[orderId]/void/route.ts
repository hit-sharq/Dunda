import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  route,
  requirePermission,
  requireSession,
  orgWhere,
  parseBody,
} from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const voidOrderSchema = z.object({
  reason: z.string().min(1, "A reason is required for voiding an order."),
});

export const POST = route(
  async (request: Request, context: { params: Promise<{ orderId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("refund_payment");
    const organizationId = session.organizationId as string;
    const { orderId } = await context.params;

    const input = await parseBody(voidOrderSchema, request);

    const order: any = await prisma.dunda_orders.findFirst({
      where: orgWhere(organizationId, { id: orderId }),
      include: {
        dunda_payments: {
          select: { id: true, status: true, amount: true },
          orderBy: { created_at: "desc" } as any,
          take: 1,
        },
      },
    });

    if (!order) {
      throw notFound("That order");
    }

    if (order.status === "CANCELLED") {
      throw wrongState("That order is already cancelled.");
    }

    if (order.status === "COMPLETED") {
      throw wrongState("A completed order cannot be cancelled. Refund the payment instead.");
    }

    const payment = order.dunda_payments[0];
    if (payment && payment.status === "SUCCESSFUL") {
      throw wrongState(
        "That order has a completed payment. Refund the payment instead of voiding the order.",
      );
    }

    if (payment && payment.status === "INITIATED") {
      await prisma.dunda_payments.update({
        where: { id: payment.id },
        data: { status: "VOIDED", voided_at: new Date(), voided_by_id: session.staffId },
      });

      await (prisma.dunda_payment_attempts as any).updateMany({
        where: { order_id: orderId, status: "INITIATED" },
        data: { status: "FAILED", failure_reason: "Order cancelled", resolved_at: new Date() },
      });
    }

    if (order.status === "SERVED" || order.status === "PAYMENT_PENDING") {
      await prisma.$transaction(async (tx) => {
        await tx.dunda_order_items.deleteMany({
          where: { order_id: orderId },
        });
        await tx.dunda_order_ticket_items.deleteMany({
          where: { ticket: { order_id: orderId } } as any,
        });
        await tx.dunda_order_tickets.deleteMany({
          where: { order_id: orderId },
        });
      });
    }

    const updated = await prisma.dunda_orders.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
      },
      select: {
        id: true,
        number: true,
        status: true,
        updated_at: true,
      },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: order.branch_id,
        staff_id: session.staffId,
        action: "VOID",
        entity: "order",
        entity_id: orderId,
        detail: `${order.number} voided: ${input.reason}`,
        previous_value: { status: order.status },
        new_value: { status: "CANCELLED", reason: input.reason },
      },
    });

    return NextResponse.json({
      id: updated.id,
      number: updated.number,
      status: updated.status,
      updated_at: updated.updated_at.toISOString(),
    });
  },
);
