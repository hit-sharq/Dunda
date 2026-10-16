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

function verifyWebhookSecret(request: Request): boolean {
  const secret = process.env.PESAPAL_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = request.headers.get("x-pesapal-webhook-secret");
  if (!provided) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}




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
    
    
    
  }
}


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
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json(
      { error: "Unauthorized webhook source.", code: "FORBIDDEN" },
      { status: 401 },
    );
  }

  const payload = await readPayload(request);
  const { orderTrackingId, merchantReference, notificationType } =
    referenceFrom(payload as Record<string, string | null | undefined>);

  await recordNotification(payload, orderTrackingId, merchantReference, notificationType);

  
  
  
  
  await processCallback(orderTrackingId, merchantReference, notificationType);

  
  
  
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
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json(
      { error: "Unauthorized webhook source.", code: "FORBIDDEN" },
      { status: 401 },
    );
  }

  const payload = await readPayload(request);
  const { orderTrackingId, merchantReference, notificationType } =
    referenceFrom(payload as Record<string, string | null | undefined>);

  await recordNotification(payload, orderTrackingId, merchantReference, notificationType);
  await processCallback(orderTrackingId, merchantReference, notificationType);

  return ipnAcknowledgement(notificationType, orderTrackingId, merchantReference);
});


async function processCallback(
  orderTrackingId: string | null,
  merchantReference: string | null,
  notificationType: string | null,
): Promise<void> {
  
  
  
  
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