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
import { notFound } from "@/lib/errors.server";
import { updateOrderStatus, ORDER_STATUSES } from "@/lib/server/tabs";

export const dynamic = "force-dynamic";

const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES as unknown as [string, ...string[]]),
});

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ orderId: string }> }) => {
    const session = await requirePermission("manage_orders");
    const organizationId = session.organizationId as string;
    const { orderId } = await context.params;

    const input = await parseBody(updateOrderStatusSchema, request);

    const order: any = await prisma.dunda_orders.findFirst({
      where: orgWhere(organizationId, { id: orderId }),
    });
    if (!order) {
      throw notFound("That order");
    }

    const updated = await updateOrderStatus(organizationId, orderId, input.status, session.staffId);

    return NextResponse.json({
      id: updated.id,
      number: updated.number,
      status: updated.status,
      updatedAt: updated.updated_at.toISOString(),
    });
  },
);
