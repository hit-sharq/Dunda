import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool, db } from "@workspace/db";
import {
  billingPaymentsTable,
  invoicesTable,
  organizationsTable,
  paymentNotificationsTable,
  plansTable,
  subscriptionsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  confirmSubscriptionPayment,
  handleProviderNotification,
  renewSubscription,
  startSubscriptionCheckout,
} from "../src/lib/billing/subscriptions";
import {
  InvalidTransitionError,
  ForbiddenTransitionError,
  applySubscriptionTransition,
  assertPaymentTransition,
  nextRenewal,
} from "../src/lib/payments/stateMachine";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  ProviderNotification,
  VerifyPaymentResult,
} from "../src/lib/payments/provider";

/**
 * The invariants that stop a club getting a paid plan for free.
 *
 * Everything here is about what the server refuses to believe: a redirect, a
 * notification, or a transaction for the wrong amount.
 */

const ORG = "billing-test-org";
const PLAN = "billing-test-plan";

/**
 * A provider we control, so a test can decide what the gateway claims.
 */
class FakeProvider implements PaymentProvider {
  readonly name = "PESAPAL" as const;
  readonly isOffline = false;
  created = 0;
  /** Each call confirms a different transaction, as a real gateway would. */
  confirmations = 0;

  constructor(
    private behaviour: {
      verify?: () => VerifyPaymentResult;
      throwOnVerify?: Error;
    } = {},
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    this.created += 1;
    return {
      provider: this.name,
      providerReference: `txn-${input.reference}`,
      paymentUrl: `https://pay.example.test/${input.reference}`,
    };
  }

  async verifyPayment(): Promise<VerifyPaymentResult> {
    if (this.behaviour.throwOnVerify) throw this.behaviour.throwOnVerify;
    return (
      this.behaviour.verify?.() ?? {
        provider: this.name,
        outcome: "VERIFIED",
        providerTransactionId: `txn-${++this.confirmations}`,
        amountConfirmed: 10000,
        currency: "KES",
        paidAt: new Date().toISOString(),
      }
    );
  }

  parseNotification(payload: unknown): ProviderNotification {
    const raw = payload as Record<string, unknown>;
    return {
      provider: this.name,
      eventId: String(raw.eventId),
      eventType: "PAYMENT_COMPLETED",
      reference: String(raw.reference),
      raw,
    };
  }

  async verifyNotification(): Promise<VerifyPaymentResult> {
    return this.verifyPayment();
  }

  async refund() {
    return { provider: this.name, providerRefundReference: null, amount: 0, success: false };
  }
}

beforeAll(async () => {
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      await pool.query("select 1");
      await seed();
      return;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}, 240_000);

afterAll(async () => {
  await cleanup();
});

async function cleanup(): Promise<void> {
  await db.delete(paymentNotificationsTable).where(eq(paymentNotificationsTable.providerEventId, "evt-test"));
  await db.delete(invoicesTable).where(eq(invoicesTable.organizationId, ORG));
  await db.delete(billingPaymentsTable).where(eq(billingPaymentsTable.organizationId, ORG));
  await db.delete(subscriptionsTable).where(eq(subscriptionsTable.organizationId, ORG));
  await db.delete(plansTable).where(eq(plansTable.id, PLAN));
  await db.delete(organizationsTable).where(eq(organizationsTable.id, ORG));
}

async function seed(): Promise<void> {
  await cleanup();
  await db.insert(organizationsTable).values({
    id: ORG,
    name: "Billing Test Org",
    slug: "billing-test-org",
    currency: "KES",
    taxRate: 16,
    serviceChargeRate: 10,
  });
  await db.insert(plansTable).values({
    id: PLAN,
    code: "TEST",
    name: "Test Plan",
    monthlyPrice: 10000,
    annualPrice: 100000,
    branchLimit: 1,
    userLimit: 5,
    modules: ["pos"],
    sortOrder: 99,
  });
}

beforeEach(async () => {
  await db.delete(paymentNotificationsTable).where(eq(paymentNotificationsTable.providerEventId, "evt-test"));
  await db.delete(invoicesTable).where(eq(invoicesTable.organizationId, ORG));
  await db.delete(billingPaymentsTable).where(eq(billingPaymentsTable.organizationId, ORG));
  await db.delete(subscriptionsTable).where(eq(subscriptionsTable.organizationId, ORG));
});

function checkoutInput() {
  return {
    organizationId: ORG,
    planId: PLAN,
    billingCycle: "MONTHLY" as const,
    payer: { name: "Test", email: "pay@test.example", phone: null },
    returnUrl: "https://app.test/return",
    cancelUrl: "https://app.test/cancel",
  };
}

async function currentSubscription() {
  return (
    await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.organizationId, ORG))
  )[0];
}

describe("subscription checkout", () => {
  it("does not activate on the payer's redirect alone", async () => {
    const provider = new FakeProvider();
    const started = await startSubscriptionCheckout(provider, checkoutInput());

    // The redirect came back, but nothing has asked the gateway yet.
    expect(started.status).toBe("PENDING");
    expect((await currentSubscription()).status).toBe("PAYMENT_PENDING");
  });

  it("activates only after the gateway confirms", async () => {
    const provider = new FakeProvider();
    await startSubscriptionCheckout(provider, checkoutInput());
    const [payment] = await db
      .select()
      .from(billingPaymentsTable)
      .where(eq(billingPaymentsTable.organizationId, ORG));

    const result = await confirmSubscriptionPayment(provider, payment.id);
    expect(result.status).toBe("VERIFIED");
    expect((await currentSubscription()).status).toBe("ACTIVE");
  });

  it("refuses an amount the club did not agree to", async () => {
    const provider = new FakeProvider({
      // KES 1 paid for a KES 10,000 plan.
      verify: () => ({
        provider: "PESAPAL",
        outcome: "VERIFIED",
        providerTransactionId: "txn-cheap",
        amountConfirmed: 1,
        currency: "KES",
      }),
    });
    await startSubscriptionCheckout(provider, checkoutInput());
    const [payment] = await db
      .select()
      .from(billingPaymentsTable)
      .where(eq(billingPaymentsTable.organizationId, ORG));

    const result = await confirmSubscriptionPayment(provider, payment.id);
    expect(result.status).toBe("REJECTED");
    expect((await currentSubscription()).status).not.toBe("ACTIVE");
  });

  it("does not record a failure when the gateway cannot be reached", async () => {
    const provider = new FakeProvider({ throwOnVerify: new Error("gateway down") });
    await startSubscriptionCheckout(provider, checkoutInput());
    const [payment] = await db
      .select()
      .from(billingPaymentsTable)
      .where(eq(billingPaymentsTable.organizationId, ORG));

    // A network problem is not a declined card.
    await expect(confirmSubscriptionPayment(provider, payment.id)).rejects.toThrow();
    const [after] = await db.select().from(billingPaymentsTable).where(eq(billingPaymentsTable.id, payment.id));
    expect(after.status).not.toBe("FAILED");
    expect((await currentSubscription()).status).toBe("PAYMENT_PENDING");
  });

  it("ignores a second confirmation of the same payment", async () => {
    const provider = new FakeProvider();
    await startSubscriptionCheckout(provider, checkoutInput());
    const [payment] = await db
      .select()
      .from(billingPaymentsTable)
      .where(eq(billingPaymentsTable.organizationId, ORG));

    const first = await confirmSubscriptionPayment(provider, payment.id);
    expect(first.status).toBe("VERIFIED");
    const firstExpiry = (await currentSubscription()).renewsAt;

    // A retry, or a second call from the payer's browser.
    const second = await confirmSubscriptionPayment(provider, payment.id);
    expect(second.status).toBe("ALREADY_SETTLED");
    // The term must not have been extended twice.
    expect((await currentSubscription()).renewsAt).toEqual(firstExpiry);
  });

  it("cannot record the same gateway transaction on two payments", async () => {
    // The database refuses it, not the service. This is the last line of defence
    // if a callback ever slipped past the application-level checks.
    const provider = new FakeProvider();
    await startSubscriptionCheckout(provider, checkoutInput());
    const [payment] = await db
      .select()
      .from(billingPaymentsTable)
      .where(eq(billingPaymentsTable.organizationId, ORG));
    await confirmSubscriptionPayment(provider, payment.id);

    const [second] = await db
      .insert(billingPaymentsTable)
      .values({
        id: "bill-duplicate",
        organizationId: ORG,
        subscriptionId: payment.subscriptionId,
        status: "COMPLETED",
        amount: 10000,
        currency: "KES",
        provider: "PESAPAL",
        providerTransactionId: "txn-reused",
      })
      .returning();
    expect(second).toBeDefined();

    await expect(
      db.insert(billingPaymentsTable).values({
        id: "bill-duplicate-2",
        organizationId: ORG,
        subscriptionId: payment.subscriptionId,
        status: "COMPLETED",
        amount: 10000,
        currency: "KES",
        provider: "PESAPAL",
        // The same gateway transaction the payment above already recorded.
        providerTransactionId: "txn-reused",
      }),
    ).rejects.toThrow();
  });

  it("issues a sequential invoice once money arrives", async () => {
    const provider = new FakeProvider();
    await startSubscriptionCheckout(provider, checkoutInput());
    const [payment] = await db
      .select()
      .from(billingPaymentsTable)
      .where(eq(billingPaymentsTable.organizationId, ORG));
    await confirmSubscriptionPayment(provider, payment.id);

    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.organizationId, ORG));
    expect(invoices).toHaveLength(1);
    expect(invoices[0].number).toMatch(/^DUNDA-\d{4}$/);
    expect(invoices[0].total).toBe(10000);
  });
});

describe("gateway notifications", () => {
  it("applies a notification once and ignores the repeat", async () => {
    const provider = new FakeProvider();
    await startSubscriptionCheckout(provider, checkoutInput());
    const [payment] = await db
      .select()
      .from(billingPaymentsTable)
      .where(eq(billingPaymentsTable.organizationId, ORG));

    const payload = { eventId: "evt-test", reference: payment.id };
    const first = await handleProviderNotification(provider, payload, {});
    expect(first.outcome).toBe("ACCEPTED");
    const expiry = (await currentSubscription()).renewsAt;

    // Gateways retry. A repeat must not buy another month.
    const second = await handleProviderNotification(provider, payload, {});
    expect(second.outcome).toBe("DUPLICATE");
    expect((await currentSubscription()).renewsAt).toEqual(expiry);

    const notes = await db
      .select()
      .from(paymentNotificationsTable)
      .where(eq(paymentNotificationsTable.providerEventId, "evt-test"));
    expect(notes).toHaveLength(1);
  });

  it("ignores a notification for a payment it cannot find", async () => {
    const provider = new FakeProvider();
    const result = await handleProviderNotification(
      provider,
      { eventId: "evt-test", reference: "no-such-payment" },
      {},
    );
    expect(result.outcome).toBe("IGNORED");
  });
});

describe("manual renewal", () => {
  it("extends the existing subscription rather than creating another", async () => {
    const provider = new FakeProvider();
    await startSubscriptionCheckout(provider, checkoutInput());
    const [payment] = await db
      .select()
      .from(billingPaymentsTable)
      .where(eq(billingPaymentsTable.organizationId, ORG));
    await confirmSubscriptionPayment(provider, payment.id);
    const subscription = await currentSubscription();
    const firstExpiry = subscription.renewsAt!;

    const renewed = await renewSubscription(provider, subscription.id, {
      payer: { name: "Test", email: "pay@test.example", phone: null },
      returnUrl: "https://app.test/return",
      cancelUrl: "https://app.test/cancel",
    });
    expect(renewed.providerReference).toBeTruthy();

    // The renewal opened a second payment; the first is already settled.
    const [second] = await db
      .select()
      .from(billingPaymentsTable)
      .where(
        and(
          eq(billingPaymentsTable.organizationId, ORG),
          eq(billingPaymentsTable.status, "PENDING"),
        ),
      );
    expect(second).toBeDefined();
    await confirmSubscriptionPayment(provider, second.id);

    const after = await currentSubscription();
    expect(after.id).toBe(subscription.id);
    expect(after.renewsAt!.getTime()).toBeGreaterThan(firstExpiry.getTime());
  });
});

describe("the state machines", () => {
  it("refuses an impossible subscription move", () => {
    // A trial club can be suspended, but only by an operator.
    expect(() =>
      applySubscriptionTransition("TRIAL", "SUSPEND", { actor: "operator" }),
    ).not.toThrow();
    expect(() => applySubscriptionTransition("CANCELLED", "ACTIVATE")).toThrow(
      InvalidTransitionError,
    );
    expect(() => applySubscriptionTransition("CANCELLED", "RENEW")).toThrow(
      InvalidTransitionError,
    );
    // An expired club renewing is allowed: that is the whole point of renewal.
    expect(applySubscriptionTransition("EXPIRED", "RENEW")).toBe("PAYMENT_PENDING");
  });

  it("will not let a payment callback suspend or cancel a club", () => {
    // A gateway confirming money may activate, fail or recover. It may never
    // take an operator action, or anyone could close a rival's account by
    // replaying a notification.
    for (const action of ["SUSPEND", "CANCEL"] as const) {
      expect(() =>
        applySubscriptionTransition("ACTIVE", action, { actor: "system" }),
      ).toThrow(ForbiddenTransitionError);
      expect(
        applySubscriptionTransition("ACTIVE", action, { actor: "operator" }),
      ).toBe(action === "SUSPEND" ? "SUSPENDED" : "CANCELLED");
    }
    // Reinstating only means anything from SUSPENDED.
    expect(() =>
      applySubscriptionTransition("SUSPENDED", "REINSTATE", { actor: "system" }),
    ).toThrow(ForbiddenTransitionError);
    expect(
      applySubscriptionTransition("SUSPENDED", "REINSTATE", { actor: "operator" }),
    ).toBe("ACTIVE");
  });

  it("refuses an impossible payment move", () => {
    expect(() => assertPaymentTransition("COMPLETED", "COMPLETED")).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertPaymentTransition("PENDING", "COMPLETED")).not.toThrow();
    // Money that moved can only be refunded, never re-pending.
    expect(() => assertPaymentTransition("COMPLETED", "PENDING")).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertPaymentTransition("REFUNDED", "COMPLETED")).toThrow(
      InvalidTransitionError,
    );
  });

  it("advances the renewal date by the billing cycle", () => {
    const from = new Date("2026-01-15T00:00:00Z");
    expect(nextRenewal("MONTHLY", from).toISOString().slice(0, 10)).toBe("2026-02-15");
    expect(nextRenewal("ANNUAL", from).toISOString().slice(0, 10)).toBe("2027-01-15");
  });
});