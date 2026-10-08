import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { route } from "@/lib/server/http";
import {
  confirmBillingPayment,
  confirmClubPayment,
  recordRecurringPayment,
  resolveCallbackReference,
} from "@/lib/server/payments";
import { PESAPAL_PROVIDER } from "@/lib/server/pesapal";

export const dynamic = "force-dynamic";

/**
 * Pesapal's callback endpoint.
 *
 * Two things arrive here. Pesapal's server posts an
 * IPN alert when a payment status changes, and the
 * buyer's browser is redirected here after paying.
 * Both are handled the same way, because neither is
 * proof: the callback is recorded, then the order's
 * status is read back from Pesapal, and only that
 * answer settles money. Pesapal deliberately sends
 * no status with either, so there is nothing here
 * to trust but the status endpoint.
 *
 * No sign-in is required — the provider has no Clerk
 * session — and none is needed, because nothing here
 * is trusted without the provider's own status endpoint.
 */

/**
 * The spellings Pesapal uses for the same two
 * references, in the callback URL, in a GET IPN and
 * in a posted IPN alike.
 */
function referenceFrom(
  source: Record<string, string | null | undefined>,
): {
  orderTrackingId: string | null;
  merchantReference: string | null;
  notificationType: string | null;
} {
  return {
    orderTrackingId:
      source.OrderTrackingId ??
      source.orderTrackingId ??
      source.order_tracking_id ??
      null,
    merchantReference:
      source.OrderMerchantReference ??
      source.orderMerchantReference ??
      source.merchant_reference ??
      null,
    notificationType:
      source.OrderNotificationType ??
      source.orderNotificationType ??
      null,
  };
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  if (request.method === "GET") {
    const params: Record<string, string> = {};
    new URL(request.url).searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Records the callback, so the trail shows what the provider said. */
async function recordNotification(
  payload: Record<string, unknown>,
  orderTrackingId: string | null,
  merchantReference: string | null,
  notificationType: string | null,
): Promise<void> {
  const eventId =
    orderTrackingId ??
    merchantReference ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await prisma.dunda_payment_notifications.create({
      data: {
        provider: PESAPAL_PROVIDER,
        provider_event_id: eventId,
        event_type: notificationType ?? "ORDER_UPDATE",
        payload: payload as Prisma.InputJsonValue,
        outcome: "ACCEPTED",
      },
    });
  } catch {
    // A repeated delivery is the provider retrying, which is
    // exactly what this endpoint is for. The record exists;
    // the work below is idempotent.
  }
}

/**
 * The acknowledgement Pesapal asks an IPN endpoint for:
 * the references it sent, and a status of 200 meaning
 * the notification was received and processed.
 */
function ipnAcknowledgement(
  notificationType: string | null,
  orderTrackingId: string | null,
  merchantReference: string | null,
) {
  return NextResponse.json({
    orderNotificationType: notificationType ?? "IPNCHANGE",
    orderTrackingId,
    orderMerchantReference: merchantReference,
    status: 200,
  });
}

export const GET = route(async (request: Request) => {
  const payload = await readPayload(request);
  const { orderTrackingId, merchantReference, notificationType } =
    referenceFrom(payload as Record<string, string | null | undefined>);

  await recordNotification(payload, orderTrackingId, merchantReference, notificationType);

  // A GET here is either the buyer's browser coming back
  // or a GET IPN. The confirmation below is the same work
  // either way, so whichever arrives first settles the
  // order and the other is a no-op.
  await processCallback(orderTrackingId, merchantReference, notificationType);

  // A browser is looking at this, not a machine, so it
  // gets a page rather than JSON. The till has its own
  // polling and shows the receipt there.
  if (notificationType === "CALLBACKURL") {
    return new NextResponse(
      `<!doctype html><html><head><meta charset="utf-8"><title>Dunda payment</title></head><body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="text-align:center"><h1 style="font-size:1.25rem">Payment received</h1><p style="color:#666">Your payment is being confirmed. You can close this window.</p></div></div></body></html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  return ipnAcknowledgement(notificationType, orderTrackingId, merchantReference);
});

export const POST = route(async (request: Request) => {
  const payload = await readPayload(request);
  const { orderTrackingId, merchantReference, notificationType } =
    referenceFrom(payload as Record<string, string | null | undefined>);

  await recordNotification(payload, orderTrackingId, merchantReference, notificationType);
  await processCallback(orderTrackingId, merchantReference, notificationType);

  return ipnAcknowledgement(notificationType, orderTrackingId, merchantReference);
});

/**
 * Confirms what the callback is about and settles it.
 *
 * An unknown reference is answered quietly rather than
 * loudly: a callback for an order this deployment never
 * created is recorded above, and refusing it with a
 * 500 would only make Pesapal retry.
 */
async function processCallback(
  orderTrackingId: string | null,
  merchantReference: string | null,
  notificationType: string | null,
): Promise<void> {
  // An automatic renewal names the
  // organization, not a payment we
  // created, so it is recorded from
  // the provider's own answer.
  if (notificationType === "RECURRING" && orderTrackingId) {
    await recordRecurringPayment(orderTrackingId);
    return;
  }

  const resolved = await resolveCallbackReference(
    orderTrackingId,
    merchantReference,
  );
  if (!resolved) return;

  if (resolved.kind === "CLUB_PAYMENT") {
    await confirmClubPayment(resolved.attemptId);
    return;
  }

  await confirmBillingPayment(resolved.billingPaymentId);
}
