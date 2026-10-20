import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";

export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const receiptId = url.searchParams.get("receiptId");
  const tabId = url.searchParams.get("tabId");
  const orderId = url.searchParams.get("orderId");

  if (!receiptId && !tabId && !orderId) {
    return NextResponse.json(
      { error: "Ask for a receipt id, tab, or order.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const receipt = await prisma.dunda_receipts.findFirst({
    where: orgWhere(organizationId, {
      ...(receiptId ? { id: receiptId } : {}),
      ...(tabId ? { tab_id: tabId } : {}),
      ...(orderId ? { order_id: orderId } : {}),
    }),
    include: {
      dunda_orders: {
        select: {
          id: true,
          number: true,
          table_name: true,
          subtotal: true,
          service_charge: true,
          tax: true,
          discount: true,
          total: true,
          dunda_order_items: {
            select: {
              id: true,
              name: true,
              quantity: true,
              unit_price: true,
              total: true,
              notes: true,
              price_overridden: true,
              original_price: true,
            },
          },
        },
      },
      dunda_tabs: { select: { id: true, number: true } },
      dunda_payments: {
        select: {
          id: true,
          amount: true,
          method: true,
          reference: true,
          status: true,
          paid_at: true,
        },
      },
    },
  });

  if (!receipt) {
    throw notFound("That receipt");
  }

  return NextResponse.json({
    id: receipt.id,
    number: receipt.number,
    customerName: receipt.customer_name,
    itemsSubtotal: receipt.items_subtotal,
    poolCharges: receipt.pool_charges,
    discount: receipt.discount,
    serviceCharge: receipt.service_charge,
    tax: receipt.tax,
    total: receipt.total,
    amountPaid: receipt.amount_paid,
    outstanding: receipt.outstanding,
    currency: receipt.currency,
    paymentMethod: receipt.payment_method,
    paymentReference: receipt.payment_reference,
    createdAt: receipt.issued_at.toISOString(),
    order: receipt.dunda_orders
      ? {
          id: receipt.dunda_orders.id,
          number: receipt.dunda_orders.number,
          tableName: receipt.dunda_orders.table_name,
          subtotal: receipt.dunda_orders.subtotal,
          serviceCharge: receipt.dunda_orders.service_charge,
          tax: receipt.dunda_orders.tax,
          discount: receipt.dunda_orders.discount,
          total: receipt.dunda_orders.total,
          items: receipt.dunda_orders.dunda_order_items.map((i) => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unit_price,
            total: i.total,
            notes: i.notes,
            priceOverridden: i.price_overridden,
            originalPrice: i.original_price,
          })),
        }
      : null,
    tab: receipt.dunda_tabs
      ? { id: receipt.dunda_tabs.id, number: receipt.dunda_tabs.number }
      : null,
    payments: receipt.dunda_payments ? [
      {
        id: receipt.dunda_payments.id,
        amount: receipt.dunda_payments.amount,
        method: receipt.dunda_payments.method,
        reference: receipt.dunda_payments.reference,
        status: receipt.dunda_payments.status,
        paidAt: receipt.dunda_payments.paid_at.toISOString(),
      },
    ] : [],
  });
});
