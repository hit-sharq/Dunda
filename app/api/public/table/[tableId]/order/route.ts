import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route } from "@/lib/server/http";
import { createOrder, addItemsToOrder } from "@/lib/server/tabs";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const publicOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        unitId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .min(1, "An order needs at least one item.")
    .max(30),
  notes: z.string().nullable().optional(),
});

export const POST = route(
  async (request: Request, context: { params: Promise<{ tableId: string }> }) => {
    checkRateLimit(clientIpKey(request), 20, 60 * 60 * 1000);

    const { tableId } = await context.params;

    const body = await request.json().catch(() => ({}));
    const parsed = publicOrderSchema.safeParse(body);
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

    const table = await prisma.dunda_tables.findUnique({
      where: { id: tableId },
      select: {
        id: true,
        name: true,
        branch_id: true,
        tab_id: true,
        dunda_branches: {
          select: {
            organization_id: true,
            dunda_organizations: { select: { name: true, status: true } },
          },
        },
      },
    });

    if (!table) {
      return NextResponse.json(
        { error: "That table is not on our floor plan.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (table.dunda_branches.dunda_organizations.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This club is not currently serving.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const { order, ticket } = await (async () => {
      // A guest scanning the table QR again is adding to the order they
      // already placed, not opening a second one.
      const openOrder = await prisma.dunda_orders.findFirst({
        where: {
          organization_id: table.dunda_branches.organization_id,
          table_id: table.id,
          status: { in: ["DRAFT", "PENDING", "ACCEPTED", "PREPARING", "READY", "SERVED"] },
        },
        orderBy: { created_at: "desc" },
        select: { id: true, number: true, status: true, subtotal: true, total: true, created_at: true },
      });

      if (openOrder) {
        const added = await addItemsToOrder({
          organizationId: table.dunda_branches.organization_id,
          orderId: openOrder.id,
          staffId: null,
          items: parsed.data.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitId: i.unitId ?? null,
            notes: i.notes ?? null,
          })),
        });
        return {
          order: { ...openOrder, subtotal: added.order.subtotal },
          ticket: added.ticket,
        };
      }

      return createOrder({
        organizationId: table.dunda_branches.organization_id,
        branchId: table.branch_id,
        tableId: table.id,
        tabId: table.tab_id,
        customerId: null,
        staffId: null,
        items: parsed.data.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitId: i.unitId ?? null,
          notes: i.notes ?? null,
        })),
        notes: parsed.data.notes ?? null,
        station: "BAR",
      });
    })();

    return NextResponse.json(
      {
        id: order.id,
        number: order.number,
        status: order.status,
        total: order.total,
        ticket: { id: ticket.id, number: ticket.number, station: ticket.station },
        createdAt: order.created_at.toISOString(),
      },
      { status: 201 },
    );
  },
);
