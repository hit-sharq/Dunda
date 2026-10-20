import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Public order lookup so a guest can check on their order after scanning the
 * table QR. The order id is a uuid that the guest only ever sees on the
 * confirmation screen, so this does not leak other people's orders.
 */
export const GET = route(
  async (request: Request, context: { params: Promise<{ orderId: string }> }) => {
    const { orderId } = await context.params;

    const order = await prisma.dunda_orders.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        number: true,
        status: true,
        subtotal: true,
        service_charge: true,
        tax: true,
        discount: true,
        total: true,
        created_at: true,
        dunda_order_items: {
          select: { id: true, name: true, quantity: true, unit_price: true, total: true, notes: true },
        },
        dunda_order_tickets: {
          select: { id: true, station: true, status: true },
        },
        dunda_branches: { select: { name: true } },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "We could not find that order.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const ready = order.dunda_order_tickets.some((t) => t.status === "READY");
    const served = order.dunda_order_tickets.some((t) => t.status === "SERVED");

    return NextResponse.json({
      id: order.id,
      number: order.number,
      status: order.status,
      branch: order.dunda_branches.name,
      subtotal: order.subtotal,
      serviceCharge: order.service_charge,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      createdAt: order.created_at.toISOString(),
      // Plain-language state the guest cares about.
      stage: served
        ? "SERVED"
        : ready
          ? "READY"
          : order.status === "CANCELLED"
            ? "CANCELLED"
            : order.status === "COMPLETED"
              ? "COMPLETED"
              : "IN_PROGRESS",
      items: order.dunda_order_items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        total: i.total,
        notes: i.notes,
      })),
    });
  },
);
