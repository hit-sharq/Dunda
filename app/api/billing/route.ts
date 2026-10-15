import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  route,
  resolveSession,
  Forbidden,
  NotProvisioned,
} from "@/lib/server/http";
import { getOpenBillingPayment, requestBillingPayment } from "@/lib/server/payments";

export const dynamic = "force-dynamic";


export const GET = route(async () => {
  const session = await resolveSession();
  
  
  
  
  if (!session || !session.organizationId) throw new NotProvisioned();
  if (session.isOperator) throw new Forbidden("club_billing");

  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { organization_id: session.organizationId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      plan: true,
      plan_id: true,
      status: true,
      billing_cycle: true,
      amount: true,
      currency: true,
      auto_renew: true,
      auto_renew_pending: true,
      started_at: true,
      trial_ends_at: true,
      renews_at: true,
      failed_payment_count: true,
    },
  });

  const payment = await getOpenBillingPayment(session.organizationId);

  return NextResponse.json({
    subscription: subscription
      ? {
          id: subscription.id,
          plan: subscription.plan,
          planId: subscription.plan_id,
          status: subscription.status,
          billingCycle: subscription.billing_cycle,
          amount: subscription.amount,
          currency: subscription.currency,
          autoRenew: subscription.auto_renew,
          autoRenewPending: subscription.auto_renew_pending,
          startedAt: subscription.started_at?.toISOString() ?? null,
          trialEndsAt: subscription.trial_ends_at?.toISOString() ?? null,
          renewsAt: subscription.renews_at?.toISOString() ?? null,
          failedPaymentCount: subscription.failed_payment_count,
        }
      : null,
    payment,
  });
});


export const POST = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session || !session.organizationId) throw new NotProvisioned();
  if (session.isOperator) throw new Forbidden("club_billing");
  if (!session.isOwner) throw new Forbidden("owner");

  const body = (await request.json().catch(() => ({}))) as { autoRenew?: unknown };
  const initiation = await requestBillingPayment(
    session.organizationId,
    body.autoRenew === true,
  );
  return NextResponse.json(initiation);
});