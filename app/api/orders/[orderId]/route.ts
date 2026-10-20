import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  route,
  requireSession,
  orgWhere,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(
  async (request: Request, context: { params: Promise<{ orderId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { orderId } = await context.params;

    const order: any = await prisma.dunda_orders.findFirst({
      where: orgWhere(organizationId, { id: orderId }),
    });

    if (!order) {
      return NextResponse.json(
        { error: "That order does not exist.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const [items, tickets, staff, customer, table, tab, payments] = await Promise.all([
      prisma.dunda_order_items.findMany({
        where: { order_id: orderId },
      }),
      prisma.dunda_order_tickets.findMany({
        where: { order_id: orderId },
      }),
      order.staff_id
        ? prisma.dunda_staff.findUnique({ where: { id: order.staff_id } })
        : Promise.resolve(null),
      order.customer_id
        ? prisma.dunda_customers.findUnique({ where: { id: order.customer_id } })
        : Promise.resolve(null),
      order.table_id
        ? prisma.dunda_tables.findUnique({ where: { id: order.table_id } })
        : Promise.resolve(null),
      order.tab_id
        ? prisma.dunda_tabs.findUnique({ where: { id: order.tab_id } })
        : Promise.resolve(null),
      prisma.dunda_payments.findMany({
        where: { order_id: orderId },
        orderBy: { created_at: "desc" } as any,
      }),
    ]);

    return NextResponse.json({
      id: order.id,
      number: order.number,
      table_name: order.table_name,
      status: order.status,
      revenue_category: order.revenue_category,
      subtotal: order.subtotal,
      service_charge: order.service_charge,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      notes: order.notes,
      created_at: order.created_at.toISOString(),
      updated_at: order.updated_at.toISOString(),
      items: (items || []).map((i: any) => ({
        id: i.id,
        product_id: i.product_id,
        unit_id: i.unit_id,
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total: i.total,
        notes: i.notes,
        category_id: i.category_id,
      })),
      tickets: (tickets || []).map((t: any) => ({
        id: t.id,
        station: t.station,
        number: t.number,
        status: t.status,
        notes: t.notes,
        tab_id: t.tab_id,
        created_at: t.created_at.toISOString(),
        updated_at: t.updated_at.toISOString(),
      })),
      staff: staff
        ? { id: staff.id, name: staff.name }
        : null,
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
          }
        : null,
      table: table
        ? { id: table.id, name: table.name }
        : null,
      tab: tab
        ? {
            id: tab.id,
            number: tab.number,
            status: tab.status,
          }
        : null,
      payments: (payments || []).map((p: any) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        method: p.method,
        reference: p.reference,
        created_at: p.created_at.toISOString(),
      })),
    });
  },
);
