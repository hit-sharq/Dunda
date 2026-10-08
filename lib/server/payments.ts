import { prisma } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { TRANSACTION_OPTIONS } from "@/lib/db/transaction";
import {
  ApiError,
  conflict,
  moneyRule,
  notFound,
} from "@/lib/errors.server";
import { getTenantSettings } from "@/lib/server/settings";
import {
  createOrder,
  getOrderStatus,
  isCompletedStatus,
  isFailedStatus,
  pesapalConfigured,
  PESAPAL_PROVIDER,
} from "@/lib/server/pesapal";
import {
  applyTabPayment,
  rebuildResult,
  type CheckoutResult,
} from "@/lib/server/tabs";

/**
 * The payment orchestration layer.
 *
 * Two kinds of money move through this file, and they are kept
 * apart on purpose. A club payment is a guest's bill at a till;
 * a billing payment is a club paying Dunda for the software.
 * Both go through Pesapal, both are recorded as an attempt
 * before the provider is asked, and both are settled only by a
 * status read back from the provider — never by a callback
 * claiming the money arrived.
 */

/** Methods that move money through a provider rather than a drawer. */
export const ELECTRONIC_METHODS = ["MPESA", "CARD", "BANK_TRANSFER"];

export function isElectronicMethod(method: string): boolean {
  return ELECTRONIC_METHODS.includes(method);
}

export interface ClubPaymentInitiation {
  attemptId: string;
  orderTrackingId: string;
  redirectUrl: string;
  amount: number;
  currency: string;
  method: string;
}

/**
 * Sends a guest to Pesapal to pay part or all of a tab.
 *
 * The amount is checked against what the tab still owes before the
 * provider is asked, so a caller cannot initiate a payment for more
 * than the bill. The attempt is written first, so a provider order
 * that never comes back still leaves a record of what was asked.
 */
export async function initiateClubPayment(input: {
  organizationId: string;
  branchId: string;
  tabId: string;
  amount: number;
  method: string;
  staffId: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  payerName?: string | null;
}): Promise<ClubPaymentInitiation> {
  const tab = await prisma.dunda_tabs.findFirst({
    where: { organization_id: input.organizationId, id: input.tabId },
    include: { dunda_payments: { select: { amount: true, status: true } } },
  });
  if (!tab) throw notFound("That tab");

  // Only live payments count towards what has been settled. A voided
  // payment puts the money back on the tab.
  const alreadyPaid = tab.dunda_payments
    .filter((p) => p.status !== "VOIDED")
    .reduce((sum, p) => sum + p.amount, 0);
  const outstanding = Math.max(0, tab.total - alreadyPaid);

  if (input.amount <= 0) {
    throw moneyRule("A payment has to be for something.");
  }
  if (input.amount > outstanding) {
    throw moneyRule(
      `That is more than the ${outstanding} still owed on this tab.`,
    );
  }

  const { currency } = await getTenantSettings(input.organizationId);

  // Asking the provider before anything is written, so a
  // deployment without credentials fails loudly here rather
  // than leaving an attempt that can never be paid.
  if (!pesapalConfigured()) {
    throw new ApiError(
      503,
      "The payment provider is not configured on this deployment.",
      { code: "PROVIDER_NOT_CONFIGURED" },
    );
  }

  // Pesapal needs a way to reach the payer, so a
  // guest with no contact details on the tab falls
  // back to the branch's own line.
  let payerEmail = input.payerEmail;
  let payerPhone = input.payerPhone;
  if (!payerEmail && !payerPhone) {
    const branch = await prisma.dunda_branches.findUnique({
      where: { id: input.branchId },
      select: { phone: true, email: true },
    });
    payerEmail = branch?.email ?? null;
    payerPhone = branch?.phone ?? null;
  }

  const attempt = await prisma.dunda_payment_attempts.create({
    data: {
      organization_id: input.organizationId,
      branch_id: input.branchId,
      tab_id: tab.id,
      amount: input.amount,
      currency,
      method: input.method,
      provider: PESAPAL_PROVIDER,
      status: "INITIATED",
    },
  });

  const organization = await prisma.dunda_organizations.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { name: true },
  });

  const order = await createOrder({
    id: attempt.id,
    amount: input.amount,
    currency,
    description: `Tab ${tab.number} at ${organization.name}`,
    payerEmail,
    payerPhone,
    payerName: input.payerName,
  });

  await prisma.$transaction(async (tx) => {
    // The tracking id is the handle the provider knows the order by,
    // so it is kept on the attempt and on the provider transaction.
    await tx.dunda_payment_attempts.update({
      where: { id: attempt.id },
      data: { reference: order.orderTrackingId },
    });
    await tx.dunda_payment_provider_transactions.create({
      data: {
        organization_id: input.organizationId,
        kind: "CLUB_PAYMENT",
        provider: PESAPAL_PROVIDER,
        provider_transaction_id: order.orderTrackingId,
        reference: attempt.id,
        amount: input.amount,
        currency,
        status: "INITIATED",
        request_payload: {
          orderId: attempt.id,
          amount: input.amount,
          currency,
          method: input.method,
          tabNumber: tab.number,
        },
        response_payload: order as unknown as Prisma.InputJsonValue,
      },
    });
  }, TRANSACTION_OPTIONS);

  return {
    attemptId: attempt.id,
    orderTrackingId: order.orderTrackingId,
    redirectUrl: order.redirectUrl,
    amount: input.amount,
    currency,
    method: input.method,
  };
}

export interface ClubPaymentConfirmation {
  attemptId: string;
  outcome: "COMPLETED" | "FAILED" | "PENDING" | "ALREADY_SETTLED";
  paymentId: string | null;
  settlement: CheckoutResult | null;
}

/**
 * Settles a club payment from the provider's own answer.
 *
 * The callback that nudges this is never trusted: the status is read
 * from Pesapal first, and only a completed order settles the tab.
 * The attempt claim inside the settlement makes a repeated callback
 * a no-op rather than a second payment.
 */
export async function confirmClubPayment(
  attemptId: string,
): Promise<ClubPaymentConfirmation> {
  const attempt = await prisma.dunda_payment_attempts.findUnique({
    where: { id: attemptId },
  });
  if (!attempt) throw notFound("That payment attempt");

  // An attempt that already resolved is answered from the books, not
  // from the provider again: the settlement it produced is the fact.
  if (attempt.status === "RESOLVED" || attempt.status === "FAILED") {
    const payment = await prisma.dunda_payments.findFirst({
      where: { idempotency_key: { startsWith: `${attemptId}#` } },
      select: { id: true, tab_id: true },
    });
    const settlement = payment?.tab_id
      ? await safeRebuild(attempt.organization_id, payment.tab_id)
      : null;
    return {
      attemptId,
      outcome: attempt.status === "RESOLVED" ? "ALREADY_SETTLED" : "FAILED",
      paymentId: payment?.id ?? null,
      settlement,
    };
  }

  // The tracking id was stored when the order was created. Falling
  // back to the attempt id covers an attempt whose order never
  // returned a tracking id.
  const status = await getOrderStatus(
    attempt.reference ?? attempt.id,
  );

  // A settlement needs the bill it settles. Attempts written
  // before attempts carried a tab have nowhere to land.
  if (!attempt.tab_id) {
    throw new ApiError(
      409,
      "That payment attempt is not attached to a tab.",
      { code: "WRONG_STATE" },
    );
  }
  const tab = await prisma.dunda_tabs.findUniqueOrThrow({
    where: { id: attempt.tab_id },
    select: { branch_id: true },
  });

  if (isFailedStatus(status.status)) {
    await prisma.dunda_payment_attempts.update({
      where: { id: attemptId },
      data: {
        status: "FAILED",
        failure_reason: `Pesapal: ${status.status}`,
        resolved_at: new Date(),
      },
    });
    return {
      attemptId,
      outcome: "FAILED",
      paymentId: null,
      settlement: null,
    };
  }

  if (!isCompletedStatus(status.status)) {
    return { attemptId, outcome: "PENDING", paymentId: null, settlement: null };
  }

  // The provider says the money arrived, so it is written against the
  // bill. The tab is re-read inside the settlement, so a bill that
  // changed while the guest was paying is settled against what it
  // actually owes now.
  const settlement = await applyTabPayment({
    organizationId: attempt.organization_id,
    tabId: attempt.tab_id,
    branchId: attempt.branch_id ?? tab.branch_id,
    payments: [
      {
        method: attempt.method,
        amount: attempt.amount,
        provider: PESAPAL_PROVIDER,
        reference: status.transactionId ?? status.paymentReference ?? null,
      },
    ],
    staffId: null,
    attemptId,
  });

    await prisma.dunda_payment_provider_transactions.updateMany({
      where: {
        provider: PESAPAL_PROVIDER,
        provider_transaction_id: status.orderTrackingId,
      },
      data: {
        status: "COMPLETED",
        response_payload: status.raw as Prisma.InputJsonValue,
        raw_status: status.status,
      },
    });

  return {
    attemptId,
    outcome: "COMPLETED",
    paymentId: settlement.payments[0]?.id ?? null,
    settlement,
  };
}

/** Rebuilds a settlement without letting a missing tab throw. */
async function safeRebuild(
  organizationId: string,
  tabId: string,
): Promise<CheckoutResult | null> {
  try {
    return await rebuildResult(organizationId, tabId, true);
  } catch {
    return null;
  }
}

export interface BillingPaymentInitiation {
  billingPaymentId: string;
  orderTrackingId: string;
  redirectUrl: string;
  amount: number;
  currency: string;
}

/**
 * Sends a club to Pesapal to pay what they owe Dunda.
 *
 * The amount comes from the subscription, never from the request,
 * and the billing payment is written as INITIATED before the
 * provider is asked, so a renewal that is in flight is visible in
 * the console rather than invisible until it lands.
 *
 * With autoRenew, the payment is also offered as an automatic
 * mandate: the club's owner accepts it on the payment page, and
 * from then on Pesapal charges the card each period without
 * anyone pressing anything. The mandate is the provider's, keyed
 * by the organization id, so a plan change does not break it.
 */
export async function initiateBillingPayment(input: {
  organizationId: string;
  subscriptionId: string;
  kind?: string;
  autoRenew?: boolean;
}): Promise<BillingPaymentInitiation> {
  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { id: input.subscriptionId, organization_id: input.organizationId },
  });
  if (!subscription) throw notFound("That subscription");
  if (!subscription.amount || subscription.amount <= 0) {
    throw moneyRule("That subscription has no amount to collect.");
  }

  if (!pesapalConfigured()) {
    throw new ApiError(
      503,
      "The payment provider is not configured on this deployment.",
      { code: "PROVIDER_NOT_CONFIGURED" },
    );
  }

  // One unpaid renewal at a time. A second order for the same
  // renewal would ask the club for the same money twice.
  const inFlight = await prisma.dunda_billing_payments.findFirst({
    where: {
      subscription_id: subscription.id,
      status: { in: ["INITIATED", "PENDING"] },
    },
    select: { id: true },
  });
  if (inFlight) {
    throw conflict("That subscription already has a payment in flight.");
  }

  const { currency } = await getTenantSettings(input.organizationId);

  const billingPayment = await prisma.dunda_billing_payments.create({
    data: {
      organization_id: input.organizationId,
      subscription_id: subscription.id,
      kind: input.kind ?? "SUBSCRIPTION_RENEWAL",
      status: "INITIATED",
      amount: subscription.amount,
      currency,
      provider: PESAPAL_PROVIDER,
    },
  });

  const organization = await prisma.dunda_organizations.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { name: true },
  });

  // The mandate covers one period, starting
  // today, so the next charge lands when the
  // next renewal is due.
  const periodDays = subscription.billing_cycle === "ANNUAL" ? 365 : 30;
  const startsAt = new Date();
  const endsAt = new Date(
    startsAt.getTime() + periodDays * 24 * 60 * 60 * 1000,
  );

  const order = await createOrder({
    id: billingPayment.id,
    amount: subscription.amount,
    currency,
    description: `Dunda ${subscription.plan} subscription for ${organization.name}`,
    // The account a recurring charge names
    // us back by: the organization, which
    // outlives any one subscription row.
    accountNumber: input.organizationId,
    subscriptionDetails: input.autoRenew
      ? {
          startDate: startsAt,
          endDate: endsAt,
          frequency:
            subscription.billing_cycle === "ANNUAL" ? "YEARLY" : "MONTHLY",
        }
      : null,
  });

  await prisma.$transaction(async (tx) => {
    await tx.dunda_billing_payments.update({
      where: { id: billingPayment.id },
      data: {
        provider_reference: order.orderTrackingId,
        // The checkout link is kept on the payment so
        // the club's own screen can offer it again
        // without asking the provider for a second
        // order for the same money.
        provider_payload: { redirectUrl: order.redirectUrl },
      },
    });
    await tx.dunda_payment_provider_transactions.create({
      data: {
        organization_id: input.organizationId,
        kind: "SUBSCRIPTION",
        provider: PESAPAL_PROVIDER,
        provider_transaction_id: order.orderTrackingId,
        reference: billingPayment.id,
        amount: subscription.amount,
        currency,
        status: "INITIATED",
        request_payload: {
          billingPaymentId: billingPayment.id,
          subscriptionId: subscription.id,
          amount: subscription.amount,
          currency,
          autoRenew: Boolean(input.autoRenew),
        },
        response_payload: order as unknown as Prisma.InputJsonValue,
      },
    });
    // The club is on automatic renewal from
    // the moment they are offered it, so the
    // renewal sweep leaves them to the mandate.
    if (input.autoRenew) {
      await tx.dunda_subscriptions.update({
        where: { id: subscription.id },
        data: { auto_renew: true },
      });
    }
  }, TRANSACTION_OPTIONS);

  return {
    billingPaymentId: billingPayment.id,
    orderTrackingId: order.orderTrackingId,
    redirectUrl: order.redirectUrl,
    amount: subscription.amount,
    currency,
  };
}

export interface OpenBillingPayment {
  billingPaymentId: string;
  orderTrackingId: string;
  redirectUrl: string;
  amount: number;
  currency: string;
  createdAt: string;
}

/** How long a checkout link is worth offering. */
const PAYMENT_LINK_TTL_DAYS = 7;

/**
 * The club's outstanding payment to Dunda, if one is open.
 *
 * A link older than the TTL is not returned: Pesapal
 * checkout links do not last forever, and offering a
 * dead one is worse than offering none.
 */
export async function getOpenBillingPayment(
  organizationId: string,
): Promise<OpenBillingPayment | null> {
  const payment = await prisma.dunda_billing_payments.findFirst({
    where: {
      organization_id: organizationId,
      status: { in: ["INITIATED", "PENDING"] },
      created_at: {
        gte: new Date(Date.now() - PAYMENT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      amount: true,
      currency: true,
      provider_reference: true,
      provider_payload: true,
      created_at: true,
    },
  });
  if (!payment) return null;

  const redirectUrl = (
    payment.provider_payload as { redirectUrl?: string } | null
  )?.redirectUrl;
  if (!redirectUrl) return null;

  return {
    billingPaymentId: payment.id,
    orderTrackingId: payment.provider_reference ?? "",
    redirectUrl,
    amount: payment.amount,
    currency: payment.currency,
    createdAt: payment.created_at.toISOString(),
  };
}

/**
 * The club owner's own way to get a payment link.
 *
 * A fresh link is returned as it is, because asking
 * again would ask the club for the same money twice.
 * A stale one is retired first, because the provider
 * would only refuse it, and a new link is created in
 * its place.
 */
export async function requestBillingPayment(
  organizationId: string,
): Promise<BillingPaymentInitiation> {
  const fresh = await getOpenBillingPayment(organizationId);
  if (fresh) {
    return {
      billingPaymentId: fresh.billingPaymentId,
      orderTrackingId: fresh.orderTrackingId,
      redirectUrl: fresh.redirectUrl,
      amount: fresh.amount,
      currency: fresh.currency,
    };
  }

  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { organization_id: organizationId },
    orderBy: { created_at: "desc" },
  });
  if (!subscription) throw notFound("That club has no subscription.");

  const stale = await prisma.dunda_billing_payments.findMany({
    where: {
      subscription_id: subscription.id,
      status: { in: ["INITIATED", "PENDING"] },
      created_at: {
        lt: new Date(Date.now() - PAYMENT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.dunda_billing_payments.updateMany({
      where: { id: { in: stale.map((payment) => payment.id) } },
      data: {
        status: "FAILED",
        failure_reason: "The payment link expired before it was used.",
      },
    });
  }

  return initiateBillingPayment({
    organizationId,
    subscriptionId: subscription.id,
    kind: "SUBSCRIPTION_RENEWAL",
    autoRenew: true,
  });
}

export interface BillingPaymentConfirmation {
  billingPaymentId: string;
  outcome: "COMPLETED" | "FAILED" | "PENDING" | "ALREADY_SETTLED";
  subscriptionStatus: string | null;
}

/**
 * Completes a subscription payment from the provider's own answer.
 *
 * A completed renewal marks the billing payment paid, sets the
 * subscription active and pushes its renewal out by a full period.
 * A failed one is recorded as failed and the subscription goes past
 * due, so the console can see who to chase.
 */
export async function confirmBillingPayment(
  billingPaymentId: string,
): Promise<BillingPaymentConfirmation> {
  const billingPayment = await prisma.dunda_billing_payments.findUnique({
    where: { id: billingPaymentId },
    include: { dunda_subscriptions: true },
  });
  if (!billingPayment) throw notFound("That billing payment");

  if (billingPayment.status === "COMPLETED") {
    return {
      billingPaymentId,
      outcome: "ALREADY_SETTLED",
      subscriptionStatus: billingPayment.dunda_subscriptions.status,
    };
  }

  const status = await getOrderStatus(
    billingPayment.provider_reference ?? billingPayment.id,
  );

  if (isFailedStatus(status.status)) {
    await prisma.$transaction(async (tx) => {
      await tx.dunda_billing_payments.update({
        where: { id: billingPaymentId },
        data: {
          status: "FAILED",
          failure_reason: `Pesapal: ${status.status}`,
          provider_transaction_id: status.transactionId,
          provider_payload: status.raw as Prisma.InputJsonValue,
        },
      });
      await tx.dunda_subscriptions.update({
        where: { id: billingPayment.subscription_id },
        data: {
          status: "PAST_DUE",
          failed_payment_count: {
            increment: 1,
          },
        },
      });
    }, TRANSACTION_OPTIONS);
    return {
      billingPaymentId,
      outcome: "FAILED",
      subscriptionStatus: "PAST_DUE",
    };
  }

  if (!isCompletedStatus(status.status)) {
    return {
      billingPaymentId,
      outcome: "PENDING",
      subscriptionStatus: billingPayment.dunda_subscriptions.status,
    };
  }

  const subscription = billingPayment.dunda_subscriptions;
  const periodDays =
    subscription.billing_cycle === "ANNUAL" ? 365 : 30;
  // A renewal runs from when the last period ended, not from when
  // the payment landed, so a club that pays a day late does not
  // lose a day of subscription.
  const renewsFrom = subscription.renews_at ?? new Date();
  const nextRenewal = new Date(
    renewsFrom.getTime() + periodDays * 24 * 60 * 60 * 1000,
  );

  await prisma.$transaction(async (tx) => {
    await tx.dunda_billing_payments.update({
      where: { id: billingPaymentId },
      data: {
        status: "COMPLETED",
        paid_at: new Date(),
        provider_transaction_id:
          status.transactionId ?? status.paymentReference ?? null,
        provider_payload: status.raw as Prisma.InputJsonValue,
      },
    });
    await tx.dunda_subscriptions.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        failed_payment_count: 0,
        started_at: subscription.started_at ?? new Date(),
        renews_at: nextRenewal,
      },
    });
    await tx.dunda_platform_audit_logs.create({
      data: {
        organization_id: billingPayment.organization_id,
        actor_clerk_user_id: null,
        action: "CREATE",
        entity: "billing_payment",
        entity_id: billingPaymentId,
        detail: `${billingPayment.amount} ${billingPayment.currency} subscription payment completed via Pesapal`,
        new_value: {
          subscriptionId: subscription.id,
          amount: billingPayment.amount,
          providerTransactionId:
            status.transactionId ?? status.paymentReference ?? null,
        },
      },
    });
  }, TRANSACTION_OPTIONS);

  return {
    billingPaymentId,
    outcome: "COMPLETED",
    subscriptionStatus: "ACTIVE",
  };
}

export interface RecurringPaymentResult {
  outcome: "COMPLETED" | "FAILED" | "UNKNOWN_ACCOUNT";
  organizationId: string | null;
  subscriptionStatus: string | null;
}

/**
 * Records an automatic renewal charged by the provider.
 *
 * A recurring charge names us back by the account
 * number — the organization — not by any payment we
 * created, so the status read is what identifies the
 * club. The charge's confirmation code is its unique
 * mark, so a notification delivered twice records one
 * payment.
 */
export async function recordRecurringPayment(
  orderTrackingId: string,
): Promise<RecurringPaymentResult> {
  const status = await getOrderStatus(orderTrackingId);
  const accountReference =
    status.subscriptionTransactionInfo?.accountReference;
  if (!accountReference) {
    return { outcome: "UNKNOWN_ACCOUNT", organizationId: null, subscriptionStatus: null };
  }

  const organization = await prisma.dunda_organizations.findUnique({
    where: { id: accountReference },
    select: { id: true },
  });
  if (!organization) {
    return { outcome: "UNKNOWN_ACCOUNT", organizationId: null, subscriptionStatus: null };
  }

  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { organization_id: organization.id },
    orderBy: { created_at: "desc" },
  });
  if (!subscription) {
    return {
      outcome: "UNKNOWN_ACCOUNT",
      organizationId: organization.id,
      subscriptionStatus: null,
    };
  }

  // The confirmation code is unique to the charge,
  // so a repeated notification is recognized here
  // rather than recorded twice.
  if (status.transactionId) {
    const alreadyRecorded = await prisma.dunda_billing_payments.findFirst({
      where: {
        provider: PESAPAL_PROVIDER,
        provider_transaction_id: status.transactionId,
      },
      select: { id: true },
    });
    if (alreadyRecorded) {
      return {
        outcome: "COMPLETED",
        organizationId: organization.id,
        subscriptionStatus: subscription.status,
      };
    }
  }

  const periodDays = subscription.billing_cycle === "ANNUAL" ? 365 : 30;
  // A renewal runs from when the last period
  // ended, so a charge that lands a day late
  // does not cost the club a day.
  const nextRenewal = new Date(
    (subscription.renews_at ?? new Date()).getTime() +
      periodDays * 24 * 60 * 60 * 1000,
  );
  const chargedAmount = status.paymentAmount ?? subscription.amount;
  const chargedCurrency = status.paymentCurrency ?? subscription.currency;

  if (!isCompletedStatus(status.status)) {
    // An automatic charge that did not go
    // through puts the subscription past due,
    // the same as a failed manual one.
    await prisma.$transaction(async (tx) => {
      await tx.dunda_billing_payments.create({
        data: {
          organization_id: organization.id,
          subscription_id: subscription.id,
          kind: "SUBSCRIPTION_RENEWAL",
          status: "FAILED",
          amount: chargedAmount,
          currency: chargedCurrency,
          provider: PESAPAL_PROVIDER,
          provider_transaction_id: status.transactionId ?? null,
          failure_reason: `Pesapal automatic charge: ${status.status}`,
          provider_payload: status.raw as Prisma.InputJsonValue,
        },
      });
      await tx.dunda_subscriptions.update({
        where: { id: subscription.id },
        data: {
          status: "PAST_DUE",
          failed_payment_count: { increment: 1 },
        },
      });
    }, TRANSACTION_OPTIONS);
    return {
      outcome: "FAILED",
      organizationId: organization.id,
      subscriptionStatus: "PAST_DUE",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.dunda_billing_payments.create({
      data: {
        organization_id: organization.id,
        subscription_id: subscription.id,
        kind: "SUBSCRIPTION_RENEWAL",
        status: "COMPLETED",
        amount: chargedAmount,
        currency: chargedCurrency,
        provider: PESAPAL_PROVIDER,
        provider_transaction_id: status.transactionId ?? null,
        paid_at: new Date(),
        provider_payload: status.raw as Prisma.InputJsonValue,
      },
    });
    await tx.dunda_subscriptions.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        failed_payment_count: 0,
        auto_renew: true,
        renews_at: nextRenewal,
      },
    });
    await tx.dunda_platform_audit_logs.create({
      data: {
        organization_id: organization.id,
        actor_clerk_user_id: null,
        action: "CREATE",
        entity: "billing_payment",
        entity_id: null,
        detail: `${chargedAmount} ${chargedCurrency} collected automatically via Pesapal`,
        new_value: {
          subscriptionId: subscription.id,
          amount: chargedAmount,
          providerTransactionId: status.transactionId ?? null,
          correlationId:
            status.subscriptionTransactionInfo?.correlationId ?? null,
        },
      },
    });
  }, TRANSACTION_OPTIONS);

  return {
    outcome: "COMPLETED",
    organizationId: organization.id,
    subscriptionStatus: "ACTIVE",
  };
}

export interface RenewalSweepResult {
  /** Subscriptions the sweep looked at. */
  checked: number;
  /** Renewals a payment link was created for. */
  initiated: {
    organizationId: string;
    organization: string;
    amount: number;
    redirectUrl: string;
  }[];
  /** Renewals left alone: a link is already open, or the provider could not be asked. */
  skipped: number;
}

/**
 * Starts a payment for every subscription coming
 * due, for clubs that are not on an automatic
 * mandate.
 *
 * A renewal is chased a week before it is due:
 * early enough for a club to act on the link,
 * late enough not to nag about a payment that is
 * not yet owed. Clubs on automatic renewal are
 * left to the mandate, which charges them without
 * this sweep.
 */
export async function runRenewalSweep(): Promise<RenewalSweepResult> {
  const horizon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const due = await prisma.dunda_subscriptions.findMany({
    where: {
      renews_at: { lte: horizon },
      status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] },
      auto_renew: false,
      cancelled_at: null,
    },
    include: {
      dunda_organizations: { select: { name: true } },
    },
    orderBy: { renews_at: "asc" },
  });

  const initiated: RenewalSweepResult["initiated"] = [];
  let skipped = 0;

  for (const subscription of due) {
    // One unpaid renewal at a time; a club is
    // not sent a second link while the first
    // is still open.
    const inFlight = await prisma.dunda_billing_payments.findFirst({
      where: {
        subscription_id: subscription.id,
        status: { in: ["INITIATED", "PENDING"] },
      },
      select: { id: true },
    });
    if (inFlight) {
      skipped += 1;
      continue;
    }

    try {
      const initiation = await initiateBillingPayment({
        organizationId: subscription.organization_id,
        subscriptionId: subscription.id,
        kind: "SUBSCRIPTION_RENEWAL",
        // A sweep collects the renewal; it
        // does not sign the club up for a
        // mandate. That is the operator's
        // offer to make.
        autoRenew: false,
      });
      initiated.push({
        organizationId: subscription.organization_id,
        organization: subscription.dunda_organizations.name,
        amount: initiation.amount,
        redirectUrl: initiation.redirectUrl,
      });
    } catch {
      // A club whose payment cannot be
      // started is counted rather than
      // stopping the rest of the sweep.
      skipped += 1;
    }
  }

  return { checked: due.length, initiated, skipped };
}

/**
 * Finds what a callback is about.
 *
 * Pesapal knows an order by its tracking id and echoes our
 * reference back as the merchant reference, so the attempt is
 * looked up by either spelling. A club payment and a subscription
 * payment are told apart by which table holds the reference.
 */
export async function resolveCallbackReference(
  orderTrackingId: string | null,
  merchantReference: string | null,
): Promise<
  | { kind: "CLUB_PAYMENT"; attemptId: string }
  | { kind: "BILLING_PAYMENT"; billingPaymentId: string }
  | null
> {
  const candidates = [orderTrackingId, merchantReference].filter(
    (value): value is string => Boolean(value),
  );
  if (candidates.length === 0) return null;

  const attempt = await prisma.dunda_payment_attempts.findFirst({
    where: {
      OR: [
        { id: { in: candidates } },
        { reference: { in: candidates } },
      ],
    },
    select: { id: true },
  });
  if (attempt) return { kind: "CLUB_PAYMENT", attemptId: attempt.id };

  const billingPayment = await prisma.dunda_billing_payments.findFirst({
    where: {
      OR: [
        { id: { in: candidates } },
        { provider_reference: { in: candidates } },
      ],
    },
    select: { id: true },
  });
  if (billingPayment) {
    return { kind: "BILLING_PAYMENT", billingPaymentId: billingPayment.id };
  }

  return null;
}
