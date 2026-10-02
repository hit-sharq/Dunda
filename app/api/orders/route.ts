import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";
import { createOrderSchema } from "@/lib/server/schemas";
import { createOrder, updateOrderStatus } from "@/lib/server/tabs";
import { notFound } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/** Orders with their items and their preparation tickets. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const status = url.searchParams.get("status");

  const orders = await prisma.dunda_orders.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      ...(status ? { status } : {}),
    }),
    orderBy: { created_at: "desc" },
    take: 100,
    include: {
      dunda_order_items: {
        select: { id: true, name: true, quantity: true, unit_price: true, total: true, notes: true },
      },
      dunda_order_tickets: { select: { id: true, station: true, number: true, status: true } },
      dunda_staff: { select: { name: true } },
      dunda_customers: { select: { name: true } },
    },
  });

  return NextResponse.json(
    orders.map((order) => ({
      id: order.id,
      number: order.number,
      table: order.table_name,
      status: order.status,
      items: order.dunda_order_items.map((i) => `${i.quantity} × ${i.name}`),
      lineItems: order.dunda_order_items,
      tickets: order.dunda_order_tickets,
      staffName: order.dunda_staff?.name ?? null,
      customerName: order.dunda_customers?.name ?? null,
      subtotal: order.subtotal,
      serviceCharge: order.service_charge,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      notes: order.notes,
      createdAt: order.created_at.toISOString(),
    })),
  );
});

/** Takes an order and routes it to the bar or the kitchen. */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const branchId = session.branchId;

  if (!branchId) {
    return NextResponse.json(
      { error: "Choose a branch first.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue ? `${issue.path.join(".") || "order"}: ${issue.message}` : "Invalid order.",
        code: "VALIDATION_FAILED",
      },
      { status: 422 },
    );
  }

  const { order, ticket } = await createOrder({
    organizationId,
    branchId,
    tableId: parsed.data.tableId ?? null,
    tabId: parsed.data.tabId ?? null,
    customerId: parsed.data.customerId ?? null,
    staffId: session.staffId,
    items: parsed.data.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitId: i.unitId ?? null,
      notes: i.notes ?? null,
    })),
    notes: parsed.data.notes ?? null,
    station: parsed.data.station,
  });

  return NextResponse.json(
    {
      id: order.id,
      number: order.number,
      status: order.status,
      subtotal: order.subtotal,
      ticket: { id: ticket.id, station: ticket.station, number: ticket.number },
      createdAt: order.created_at.toISOString(),
    },
    { status: 201 },
  );
});
