import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";
import { checkoutSchema, openTabSchema, addTabItemSchema } from "@/lib/server/schemas";
import { openTab, addTabItem, nextDocumentNumber } from "@/lib/server/tabs";
import { notFound, wrongState } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/** Open tabs with what each party currently owes. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const status = url.searchParams.get("status");

  const tabs = await prisma.dunda_tabs.findMany({
    where: orgWhere(organizationId, {
      branch_id: branchId ?? undefined,
      ...(status ? { status } : {}),
    }),
    orderBy: { opened_at: "desc" },
    take: 100,
    include: {
      dunda_tab_items: {
        select: { id: true, name: true, quantity: true, unit_price: true, total: true, category: true, notes: true },
      },
    },
  });

  return NextResponse.json(
    tabs.map((tab) => ({
      id: tab.id,
      number: tab.number,
      customer: tab.customer,
      table: tab.table_name,
      status: tab.status,
      items: tab.dunda_tab_items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total,
        category: item.category,
        notes: item.notes,
      })),
      barTotal: tab.bar_total,
      foodTotal: tab.food_total,
      poolTotal: tab.pool_total,
      subtotal: tab.subtotal,
      serviceCharge: tab.service_charge,
      tax: tab.tax,
      discount: tab.discount,
      total: tab.total,
      amountPaid: tab.amount_paid,
      outstanding: tab.outstanding,
      openedAt: tab.opened_at.toISOString(),
    })),
  );
});

/** Opens a tab at a table. */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const body = await request.json().catch(() => ({}));
  const parsed = openTabSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A tab needs a customer and a table.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const branchId = parsed.data.branchId ?? session.branchId;
  if (!branchId) {
    return NextResponse.json(
      { error: "Choose a branch first.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const tab = await openTab({
    organizationId,
    branchId,
    customer: parsed.data.customer,
    table: parsed.data.table,
    tableId: parsed.data.tableId ?? null,
    customerId: parsed.data.customerId ?? null,
    staffId: session.staffId,
  });

  return NextResponse.json(tab, { status: 201 });
});
