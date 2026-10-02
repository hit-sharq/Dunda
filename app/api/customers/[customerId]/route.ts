import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere, assertSameOrg } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Guest history: who they are, what they have on tabs, when they are due back. */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ customerId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { customerId } = await context.params;

    const customer = await prisma.dunda_customers.findFirst({
      where: orgWhere(organizationId, { id: customerId }),
    });
    assertSameOrg(customer, organizationId, "That guest");

    const [orders, tabs, reservations, payments] = await Promise.all([
      prisma.dunda_orders.findMany({
        where: orgWhere(organizationId, { customer_id: customerId }),
        orderBy: { created_at: "desc" },
        take: 20,
        select: { id: true, number: true, total: true, status: true, created_at: true },
      }),
      prisma.dunda_tabs.findMany({
        where: orgWhere(organizationId, { customer_id: customerId }),
        orderBy: { opened_at: "desc" },
        take: 20,
        select: {
          id: true,
          number: true,
          table_name: true,
          total: true,
          outstanding: true,
          status: true,
          opened_at: true,
        },
      }),
      prisma.dunda_reservations.findMany({
        where: orgWhere(organizationId, { customer_id: customerId }),
        orderBy: { starts_at: "asc" },
        take: 20,
        select: {
          id: true,
          table_name: true,
          starts_at: true,
          ends_at: true,
          status: true,
          guests: true,
        },
      }),
      prisma.dunda_payments.findMany({
        where: orgWhere(organizationId, { status: { not: "VOIDED" } }),
        orderBy: { paid_at: "desc" },
        take: 200,
        select: { amount: true, paid_at: true, method: true },
      }),
    ]);

    return NextResponse.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      vipLevel: customer.vip_level,
      totalVisits: customer.total_visits,
      totalSpend: customer.total_spend,
      lastVisitAt: customer.last_visit_at?.toISOString() ?? null,
      notes: customer.notes,
      createdAt: customer.created_at.toISOString(),
      orders: orders.map((o) => ({
        id: o.id,
        number: o.number,
        total: o.total,
        status: o.status,
        createdAt: o.created_at.toISOString(),
      })),
      tabs: tabs.map((t) => ({
        id: t.id,
        number: t.number,
        table: t.table_name,
        total: t.total,
        outstanding: t.outstanding,
        status: t.status,
        openedAt: t.opened_at.toISOString(),
      })),
      reservations: reservations.map((r) => ({
        id: r.id,
        table: r.table_name,
        startsAt: r.starts_at.toISOString(),
        endsAt: r.ends_at.toISOString(),
        status: r.status,
        guests: r.guests,
      })),
    });
  },
);
