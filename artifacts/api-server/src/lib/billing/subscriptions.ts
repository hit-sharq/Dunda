import { and, eq, sql } from "drizzle-orm";
import {
  billingPaymentsTable,
  db,
  invoicesTable,
  paymentNotificationsTable,
  plansTable,
  subscriptionsTable,
  type Subscription,
} from "@workspace/db";
import { z } from "zod";
import { logger } from "../logger";
import {
  ProviderUnavailableError,
  type CreatePaymentResult,
  type PaymentProvider,
  type VerifyPaymentResult,
} from "../payments/provider";
import {
  applySubscriptionTransition,
  nextRenewal,
  type SubscriptionAction,
  type SubscriptionStatus,
} from "../payments/stateMachine";

/**
 * Subscription billing: the money a club pays Dunda.
 *
 * Nothing here decides that a club has paid. It asks the gateway, compares the
 * amount it confirmed against the amount we expected, and only then moves the
 * subscription. A redirect from the payer, or a notification the gateway
 * pushed, is treated as a claim to be checked rather than as proof.
 */

function reference(): string {
  return `DN-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class BillingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export interface StartCheckoutInput {
  organizationId: string;
  planId: string;
  billingCycle: "MONTHLY" | "ANNUAL";
  payer: { name?: string | null; email?: string | null; phone?: string | null };
  returnUrl: string;
  cancelUrl: string;
  /** Starts a trial rather than charging now. */
  trial?: boolean;
}

export interface StartCheckoutResult {
  subscription: Subscription;
  paymentUrl: string;
  providerReference: string;
  status: PaymentStatusOf;
  amount: number;
  currency: string;
}

type PaymentStatusOf = "INITIATED" | "PENDING" | "TRIAL" | "SUBSCRIBED";

/**
 * Opens a subscription and, unless it is a trial, a payment for the first
 * term. The subscription is not active until the money is confirmed.
 */
export async function startSubscriptionCheckout(
  provider: PaymentProvider,
  input: StartCheckoutInput,
): Promise<StartCheckoutResult> {
  const [plan] = await db
    .select()
    .from(plansTable)
    .where(and(eq(plansTable.id, input.planId), eq(plansTable.isActive, true)));
  if (!plan) throw new BillingError("That plan is not available.", 404, "PLAN_NOT_FOUND");

  const amount =
    input.billingCycle === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;
  const currency = "KES";
  const now = new Date();

  // A club that cancelled and came back starts again cleanly.
  const [existing] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.organizationId, input.organizationId));

  const [branchCount] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(sql`dunda_branches`)
    .where(sql`organization_id = ${input.organizationId}`);

  const subscription = await db.transaction(async (tx): Promise<Subscription> => {
    const row = existing
      ? (
          await tx
            .update(subscriptionsTable)
            .set({
              planId: plan.id,
              plan: plan.code,
              billingCycle: input.billingCycle,
              amount,
              currency,
              status: input.trial ? "TRIAL" : "PAYMENT_PENDING",
              trialEndsAt: input.trial ? nextRenewal(input.billingCycle, now) : null,
              branchLimit: plan.branchLimit,
              userLimit: plan.userLimit,
              currentBranches: branchCount?.n ?? 0,
              failedPaymentCount: 0,
              updatedAt: now,
            })
            .where(eq(subscriptionsTable.id, existing.id))
            .returning()
        )[0]
      : (
          await tx
            .insert(subscriptionsTable)
            .values({
              id: uid("sub"),
              organizationId: input.organizationId,
              planId: plan.id,
              plan: plan.code,
              billingCycle: input.billingCycle,
              amount,
              currency,
              status: input.trial ? "TRIAL" : "PAYMENT_PENDING",
              trialEndsAt: input.trial ? nextRenewal(input.billingCycle, now) : null,
              renewsAt: input.trial ? nextRenewal(input.billingCycle, now) : null,
              branchLimit: plan.branchLimit,
              userLimit: plan.userLimit,
              currentBranches: branchCount?.n ?? 0,
              startedAt: now,
            })
            .returning()
        )[0];

    if (!input.trial) {
      await tx.insert(billingPaymentsTable).values({
        id: uid("bill"),
        organizationId: input.organizationId,
        subscriptionId: row.id,
        kind: "SUBSCRIPTION",
        status: "INITIATED",
        amount,
        currency,
        provider: provider.name,
      });
    }
    return row;
  });

  if (input.trial) {
    return {
      subscription,
      paymentUrl: "",
      providerReference: "",
      status: "TRIAL",
      amount: 0,
      currency,
    };
  }

  const [payment] = await db
    .select()
    .from(billingPaymentsTable)
    .where(
      and(
        eq(billingPaymentsTable.subscriptionId, subscription.id),
        eq(billingPaymentsTable.status, "INITIATED"),
      ),
    );

  let checkout: CreatePaymentResult;
  try {
    checkout = await provider.createPayment({
      reference: payment!.id,
      amount,
      currency,
      description: `Dunda ${plan.name} — ${input.billingCycle.toLowerCase()}`,
      payer: input.payer,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      callbackData: { subscriptionId: subscription.id, paymentId: payment!.id },
    });
  } catch (err) {
    // The money never moved, so the club must not sit in PAYMENT_PENDING.
    await db
      .update(subscriptionsTable)
      .set({ status: "PAYMENT_FAILED", updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, subscription.id));
    await db
      .update(billingPaymentsTable)
      .set({
        status: "FAILED",
        failureReason:
          err instanceof ProviderUnavailableError ? err.message : "The payment could not be opened.",
      })
      .where(eq(billingPaymentsTable.id, payment!.id));
    throw err;
  }

  await db
    .update(billingPaymentsTable)
    .set({ providerReference: checkout.providerReference, status: "PENDING" })
    .where(eq(billingPaymentsTable.id, payment!.id));

  return {
    subscription,
    paymentUrl: checkout.paymentUrl,
    providerReference: checkout.providerReference,
    status: "PENDING",
    amount,
    currency,
  };
}

/**
 * Confirms a transaction and, if the money really arrived, activates the term.
 *
 * Called from the return-from-redirect path and from the gateway's
 * notification. Both are untrusted, so both come through here.
 */
export async function confirmSubscriptionPayment(
  provider: PaymentProvider,
  paymentId: string,
): Promise<
  | { status: "VERIFIED"; subscription: Subscription; paymentId: string }
  | { status: "ALREADY_SETTLED"; subscription: Subscription }
  | {
      status: "REJECTED";
      reason: string;
      subscription?: Subscription;
    }
> {
  const [payment] = await db
    .select()
    .from(billingPaymentsTable)
    .where(eq(billingPaymentsTable.id, paymentId));
  if (!payment) {
    throw new BillingError("No such payment.", 404, "PAYMENT_NOT_FOUND");
  }
  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, payment.subscriptionId));
  if (!subscription) {
    throw new BillingError("No such subscription.", 404, "SUBSCRIPTION_NOT_FOUND");
  }

  // Already settled: a repeated callback must not extend the term twice.
  if (payment.status === "COMPLETED") {
    return { status: "ALREADY_SETTLED", subscription };
  }

  const reference = payment.providerReference ?? payment.id;
  let verified: VerifyPaymentResult;
  try {
    verified = await provider.verifyPayment(reference);
  } catch (err) {
    // The gateway could not be reached. That is not a failed payment, and it
    // must not be recorded as one.
    await db
      .update(billingPaymentsTable)
      .set({ failureReason: "The gateway could not be reached to confirm this payment." })
      .where(eq(billingPaymentsTable.id, payment.id));
    throw new BillingError(
      "We could not confirm this payment yet. Nothing has been charged; please try again.",
      503,
      "PROVIDER_UNAVAILABLE",
    );
  }

  if (verified.outcome !== "VERIFIED") {
    await db
      .update(billingPaymentsTable)
      .set({
        status: verified.outcome === "CANCELLED" ? "CANCELLED" : "FAILED",
        failureReason: verified.reason ?? "The payment was not completed.",
        providerTransactionId: verified.providerTransactionId ?? null,
        providerPayload: verified.raw ?? null,
      })
      .where(eq(billingPaymentsTable.id, payment.id));

    if (subscription.status === "PAYMENT_PENDING") {
      const status = applySubscriptionTransition("PAYMENT_PENDING", "PAYMENT_FAILED");
      await db
        .update(subscriptionsTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(subscriptionsTable.id, subscription.id));
    }
    return {
      status: "REJECTED",
      reason: verified.reason ?? "The payment was not completed.",
    };
  }

  // The gateway says COMPLETED. It still has to be the amount we asked for, or
  // someone pays KES 1 and receives a KES 20,000 plan.
  if (
    verified.amountConfirmed !== null &&
    verified.amountConfirmed !== payment.amount
  ) {
    await db
      .update(billingPaymentsTable)
      .set({
        status: "FAILED",
        failureReason: `Amount mismatch: expected ${payment.amount}, gateway confirmed ${verified.amountConfirmed}.`,
        providerTransactionId: verified.providerTransactionId ?? null,
      })
      .where(eq(billingPaymentsTable.id, payment.id));
    return {
      status: "REJECTED",
      reason: "The amount confirmed does not match the amount due.",
    };
  }

  const paidAt = verified.paidAt ? new Date(verified.paidAt) : new Date();
  const action: SubscriptionAction =
    subscription.status === "ACTIVE" ? "RENEW" : "ACTIVATE";

  const settled = await db.transaction(async (tx) => {
    // Re-read under the transaction so a second callback cannot extend twice.
    const [current] = await tx
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, subscription.id));
    const [currentPayment] = await tx
      .select()
      .from(billingPaymentsTable)
      .where(eq(billingPaymentsTable.id, payment.id));
    if (currentPayment?.status === "COMPLETED") {
      return { subscription: current, duplicate: true };
    }

    const from = (current?.status ?? subscription.status) as SubscriptionStatus;
    const status = applySubscriptionTransition(from, action);

    const startsAt =
      action === "RENEW" && current?.renewsAt && current.renewsAt > paidAt
        ? current.renewsAt
        : paidAt;
    const cycle = (current?.billingCycle ?? subscription.billingCycle) === "ANNUAL"
      ? "ANNUAL"
      : "MONTHLY";
    const renewsAt = nextRenewal(cycle, startsAt);

    const [updated] = await tx
      .update(subscriptionsTable)
      .set({
        status,
        startedAt: current?.startedAt ?? paidAt,
        renewsAt,
        failedPaymentCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionsTable.id, subscription.id))
      .returning();

    await tx
      .update(billingPaymentsTable)
      .set({
        status: "COMPLETED",
        paidAt,
        providerTransactionId:
          verified.providerTransactionId ?? currentPayment?.providerReference ?? null,
        providerPayload: verified.raw ?? null,
      })
      .where(eq(billingPaymentsTable.id, payment.id));

    await tx.insert(invoicesTable).values({
      id: uid("inv"),
      number: await nextInvoiceNumber(tx, subscription.organizationId),
      organizationId: subscription.organizationId,
      subscriptionId: subscription.id,
      billingPaymentId: payment.id,
      amount: payment.amount,
      taxAmount: 0,
      total: payment.amount,
      currency: payment.currency,
      status: "ISSUED",
      periodStart: startsAt,
      periodEnd: renewsAt,
    });

    return { subscription: updated, duplicate: false };
  });

  if (settled.duplicate) {
    return { status: "ALREADY_SETTLED", subscription: settled.subscription };
  }
  return {
    status: "VERIFIED",
    subscription: settled.subscription,
    paymentId: payment.id,
  };
}

/**
 * Sequential per organization, because an unbroken invoice sequence is expected
 * and backfilling one is painful.
 */
async function nextInvoiceNumber(tx: any, organizationId: string): Promise<string> {
  const [row] = await tx
    .select({ max: sql<string>`max(right(number, 4))`.mapWith(String) })
    .from(invoicesTable)
    .where(eq(invoicesTable.organizationId, organizationId));
  const next = (Number(row?.max ?? 0) || 0) + 1;
  return `DUNDA-${String(next).padStart(4, "0")}`;
}

/**
 * Records a gateway notification.
 *
 * Gateways retry, so the same notification arrives repeatedly. The provider's own
 * identifier is unique, which makes a repeat a no-op instead of a second
 * extension of the term.
 */
export async function handleProviderNotification(
  provider: PaymentProvider,
  payload: unknown,
  headers: Record<string, string | undefined>,
): Promise<{ outcome: "ACCEPTED" | "DUPLICATE" | "IGNORED" | "FAILED"; detail?: string }> {
  let notification;
  try {
    notification = provider.parseNotification(payload, headers);
  } catch (err) {
    return { outcome: "IGNORED", detail: (err as Error).message };
  }

  const existing = await db
    .select({ id: paymentNotificationsTable.id })
    .from(paymentNotificationsTable)
    .where(
      and(
        eq(paymentNotificationsTable.provider, notification.provider),
        eq(paymentNotificationsTable.providerEventId, notification.eventId),
      ),
    );
  if (existing.length) {
    return { outcome: "DUPLICATE" };
  }

  const id = uid("note");
  await db.insert(paymentNotificationsTable).values({
    id,
    provider: notification.provider,
    providerEventId: notification.eventId,
    eventType: notification.eventType,
    payload: notification.raw,
    outcome: "ACCEPTED",
  });

  if (!notification.reference) {
    await db
      .update(paymentNotificationsTable)
      .set({ outcome: "IGNORED", error: "No reference to match a payment." })
      .where(eq(paymentNotificationsTable.id, id));
    return { outcome: "IGNORED", detail: "No reference" };
  }

  const [payment] = await db
    .select({ id: billingPaymentsTable.id })
    .from(billingPaymentsTable)
    .where(eq(billingPaymentsTable.id, notification.reference));
  if (!payment) {
    await db
      .update(paymentNotificationsTable)
      .set({ outcome: "IGNORED", error: "No matching payment." })
      .where(eq(paymentNotificationsTable.id, id));
    return { outcome: "IGNORED", detail: "No matching payment" };
  }

  await db
    .update(paymentNotificationsTable)
    .set({ billingPaymentId: payment.id })
    .where(eq(paymentNotificationsTable.id, id));

  try {
    await confirmSubscriptionPayment(provider, payment.id);
    await db
      .update(paymentNotificationsTable)
      .set({ processedAt: new Date() })
      .where(eq(paymentNotificationsTable.id, id));
    return { outcome: "ACCEPTED" };
  } catch (err) {
    await db
      .update(paymentNotificationsTable)
      .set({ outcome: "FAILED", error: (err as Error).message })
      .where(eq(paymentNotificationsTable.id, id));
    return { outcome: "FAILED", detail: (err as Error).message };
  }
}

/**
 * Renewal, which is a new payment against the existing subscription rather than a
 * new one. Manual in this version: nothing charges on its own.
 */
export async function renewSubscription(
  provider: PaymentProvider,
  subscriptionId: string,
  input: {
    payer: { name?: string | null; email?: string | null; phone?: string | null };
    returnUrl: string;
    cancelUrl: string;
  },
): Promise<StartCheckoutResult> {
  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, subscriptionId));
  if (!subscription) {
    throw new BillingError("No such subscription.", 404, "SUBSCRIPTION_NOT_FOUND");
  }
  if (subscription.status === "CANCELLED") {
    throw new BillingError(
      "This subscription was cancelled. Start a new one instead.",
      409,
      "SUBSCRIPTION_CANCELLED",
    );
  }
  if (subscription.planId === null) {
    throw new BillingError(
      "This subscription is priced by agreement rather than from the catalogue.",
      409,
      "NO_CATALOGUE_PLAN",
    );
  }
  return startSubscriptionCheckout(provider, {
    organizationId: subscription.organizationId,
    planId: subscription.planId,
    billingCycle: (subscription.billingCycle === "ANNUAL" ? "ANNUAL" : "MONTHLY") as "MONTHLY" | "ANNUAL",
    payer: input.payer,
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
  });
}