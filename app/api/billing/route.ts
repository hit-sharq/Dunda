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

/**
 * The club's own subscription, and what it owes Dunda.
 *
 * This is the club owner's view of billing: which
 * plan they are on, and the payment link they are
 * meant to complete. It is deliberately separate
 * from the console's billing, which is the
 * platform's ledger rather than a club's bill.
 */
export const GET = route(async () => {
  const session = await resolveSession();
  // A signed-in account with no club has nothing
  // to pay with, and an operator runs the platform
  // rather than a club, so both are refused rather
  // than answered with somebody else's bill.
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
          startedAt: subscription.started_at?.toISOString() ?? null,
          trialEndsAt: subscription.trial_ends_at?.toISOString() ?? null,
          renewsAt: subscription.renews_at?.toISOString() ?? null,
          failedPaymentCount: subscription.failed_payment_count,
        }
      : null,
    payment,
  });
});

/**
 * The club owner asks for their payment link.
 *
 * Paying for the software is the owner's own
 * decision, so it is theirs to initiate. A link
 * already open is returned rather than replaced,
 * because a second order would ask for the same
 * money twice.
 */
export const POST = route(async () => {
  const session = await resolveSession();
  if (!session || !session.organizationId) throw new NotProvisioned();
  if (session.isOperator) throw new Forbidden("club_billing");
  if (!session.isOwner) throw new Forbidden("owner");

  const initiation = await requestBillingPayment(session.organizationId);
  return NextResponse.json(initiation);
});
