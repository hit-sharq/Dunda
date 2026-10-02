import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere, assertSameOrg } from "@/lib/server/http";
import {
  addTabItem,
  applyDiscount,
  closeTab,
  checkoutTab,
} from "@/lib/server/tabs";
import {
  addTabItemSchema,
  checkoutSchema,
  closeTabSchema,
  discountSchema,
} from "@/lib/server/schemas";
import { isLargeDiscount, DEFAULT_LARGE_DISCOUNT_PERCENT } from "@/lib/server/money";
import { notFound, wrongState, ApiError } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

/** One tab in full: its items, its running totals and everything paid on it. */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ tabId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { tabId } = await context.params;

    const tab = await prisma.dunda_tabs.findFirst({
      where: orgWhere(organizationId, { id: tabId }),
      include: {
        dunda_tab_items: { orderBy: { id: "asc" } },
        dunda_payments: { orderBy: { paid_at: "asc" } },
        dunda_pool_sessions: { select: { id: true, status: true, started_at: true } },
        dunda_receipts: { orderBy: { issued_at: "desc" } },
      },
    });
    assertSameOrg(tab, organizationId, "That tab");

    return NextResponse.json({
      id: tab.id,
      number: tab.number,
      customer: tab.customer,
      table: tab.table_name,
      status: tab.status,
      items: tab.dunda_tab_items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        total: i.total,
        category: i.category,
        notes: i.notes,
        unitName: i.unit_name,
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
      closedAt: tab.closed_at?.toISOString() ?? null,
      payments: tab.dunda_payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: p.amount,
        reference: p.reference,
        status: p.status,
        paidAt: p.paid_at.toISOString(),
      })),
      poolSessions: tab.dunda_pool_sessions,
      receipts: tab.dunda_receipts.map((r) => ({
        id: r.id,
        number: r.number,
        total: r.total,
        amountPaid: r.amount_paid,
        outstanding: r.outstanding,
        issuedAt: r.issued_at.toISOString(),
      })),
    });
  },
);

/** Adds a line, applies a discount, or closes the tab. */
export const POST = route(
  async (request: Request, context: { params: Promise<{ tabId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { tabId } = await context.params;

    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "item";

    if (action === "item") {
      const body = await request.json().catch(() => ({}));
      const parsed = addTabItemSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "That order line needs a product and a quantity.", code: "VALIDATION_FAILED" },
          { status: 422 },
        );
      }
      const tab = await addTabItem({
        organizationId,
        tabId,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        unitId: parsed.data.unitId ?? null,
        notes: parsed.data.notes ?? null,
        staffId: session.staffId,
      });
      return NextResponse.json(tab);
    }

    if (action === "discount") {
      const body = await request.json().catch(() => ({}));
      const parsed = discountSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Enter a discount amount.", code: "VALIDATION_FAILED" },
          { status: 422 },
        );
      }

      // A discount beyond the threshold is a manager's call. Checking it here
      // rather than in the service means the rule sits with the permission that
      // grants it, and the refusal names what is missing.
      const current = await prisma.dunda_tabs.findFirst({
        where: orgWhere(organizationId, { id: tabId }),
        select: { subtotal: true },
      });
      if (
        current &&
        isLargeDiscount(current.subtotal, parsed.data.discount, DEFAULT_LARGE_DISCOUNT_PERCENT) &&
        !session.permissions.has("apply_discount")
      ) {
        throw new ApiError(
          403,
          "A discount that size needs a manager.",
          { code: "FORBIDDEN", required: "apply_discount" },
        );
      }

      const tab = await applyDiscount(organizationId, tabId, parsed.data.discount, session.staffId);
      return NextResponse.json(tab);
    }

    if (action === "close") {
      const body = await request.json().catch(() => ({}));
      const parsed = closeTabSchema.safeParse(body);
      const allowOutstanding = parsed.success ? parsed.data.allowOutstanding : false;

      // Leaving a bill unsettled is the one thing a cashier cannot do alone.
      if (allowOutstanding && !session.permissions.has("manage_payments")) {
        throw new ApiError(
          403,
          "Closing a tab with money still owing needs a manager.",
          { code: "FORBIDDEN", required: "manage_payments" },
        );
      }

      const tab = await closeTab(organizationId, tabId, {
        allowOutstanding,
        staffId: session.staffId,
        reason: parsed.success ? parsed.data.reason ?? null : null,
      });
      return NextResponse.json(tab);
    }

    throw wrongState("That is not something a tab can do.");
  },
);
