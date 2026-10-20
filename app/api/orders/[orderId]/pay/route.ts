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
import { createOrder as createPesapalOrder } from "@/lib/server/pesapal";
import { getTenantSettings } from "@/lib/server/settings";
import { getOrganizationPesapalCredentials } from "@/lib/server/pesapal-credentials";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const payOrderSchema = z.object({
  amount: z.number().int().positive("Amount must be positive"),
  method: z.enum(["CASH", "MPESA", "CARD", "BANK_TRANSFER", "OTHER"]),
});

export const POST = route(
  async (request: Request, context: { params: Promise<{ orderId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { orderId } = await context.params;

    const input = await parseBody(payOrderSchema, request);

    const order: any = await prisma.dunda_orders.findFirst({
      where: orgWhere(organizationId, { id: orderId }),
      select: {
        id: true,
        number: true,
        status: true,
        branch_id: true,
        total: true,
      },
    });
    if (!order) {
      throw notFound("That order");
    }

    if (order.status === "COMPLETED") {
      throw wrongState("That order is already completed.");
    }

    if (order.status === "CANCELLED") {
      throw wrongState("That order is cancelled and cannot be paid.");
    }

    if (input.amount > order.total) {
      throw wrongState(
        `Payment amount (${input.amount}) exceeds order total (${order.total}).`,
      );
    }

    const settings = await getTenantSettings(organizationId);
    const currency = settings.currency;

    const credentials = await getOrganizationPesapalCredentials(organizationId);

    const pesapalOrder = await createPesapalOrder({
      id: orderId,
      amount: input.amount,
      currency,
      description: `Order ${order.number}`,
      credentials,
    });

    const attempt: any = await (prisma.dunda_payment_attempts as any).create({
      data: {
        organization_id: organizationId,
        branch_id: order.branch_id,
        order_id: orderId,
        amount: input.amount,
        currency,
        method: input.method,
        provider: "PESAPAL",
        status: "INITIATED",
        reference: pesapalOrder.orderTrackingId,
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        reference: true,
        created_at: true,
      },
    });

    await prisma.dunda_payment_provider_transactions.create({
      data: {
        organization_id: organizationId,
        kind: "ORDER_PAYMENT",
        provider: "PESAPAL",
        provider_transaction_id: pesapalOrder.orderTrackingId,
        reference: attempt.id,
        amount: input.amount,
        currency,
        status: "INITIATED",
        request_payload: {
          orderId: orderId,
          amount: input.amount,
          currency,
          method: input.method,
        },
        response_payload: pesapalOrder as any,
      },
    });

    if (order.status !== "PAYMENT_PENDING") {
      await prisma.dunda_orders.update({
        where: { id: orderId },
        data: { status: "PAYMENT_PENDING" },
      });
    }

    return NextResponse.json(
      {
        attemptId: attempt.id,
        orderTrackingId: pesapalOrder.orderTrackingId,
        redirectUrl: pesapalOrder.redirectUrl,
        amount: input.amount,
        currency,
        status: "INITIATED",
      },
      { status: 201 },
    );
  },
);
