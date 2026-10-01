/**
 * The provider boundary.
 *
 * Nothing above this file knows how a payment is actually taken. The club app
 * and the billing flow both talk to a PaymentProvider, so moving to Safaricom
 * Daraja, adding a second gateway, or taking cash on one side and a card on the
 * other touches no business logic.
 *
 * Two flows share this interface but never share a ledger:
 *
 *   Subscription: club -> Dunda   (dunda_billing_payments)
 *   POS:          customer -> club (dunda_payments)
 *
 * Both are priced and verified on the server. A provider never decides whether a
 * subscription is active; it only reports what happened to a transaction.
 */

export type PaymentKind = "SUBSCRIPTION" | "POS";

export type PaymentProviderName = "PESAPAL" | "CASH" | "DARAJA";

/** What we tell the gateway to charge. All amounts are whole units. */
export interface CreatePaymentInput {
  /** Our reference for this attempt. Shown to the payer and used to reconcile. */
  reference: string;
  amount: number;
  currency: string;
  description: string;
  /** Who is paying, for the gateway's own record. */
  payer: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  /** Where to send the payer after the gateway. */
  returnUrl: string;
  cancelUrl: string;
  /** Passed through untouched so the notification can be traced back. */
  callbackData?: Record<string, string>;
}

export interface CreatePaymentResult {
  provider: PaymentProviderName;
  /** The gateway's identifier for the transaction we just opened. */
  providerReference: string;
  /** Where to send the payer to pay. */
  paymentUrl: string;
  expiresAt?: string | null;
}

/**
 * What the gateway says happened.
 *
 * Only VERIFIED is allowed to move money. A redirect from the payer comes
 * through as ADAPTER_REDIRECT and is worth nothing on its own, because anyone can
 * open that URL.
 */
export type PaymentOutcome =
  | "VERIFIED"
  | "ADAPTER_REDIRECT"
  | "FAILED"
  | "CANCELLED";

export interface VerifyPaymentResult {
  provider: PaymentProviderName;
  outcome: PaymentOutcome;
  /** Present only once the gateway confirms a real transaction. */
  providerTransactionId?: string | null;
  amountConfirmed?: number | null;
  currency?: string | null;
  paidAt?: string | null;
  /** Free text for the trail, e.g. "AMOUNT_MISMATCH". */
  reason?: string | null;
  raw?: Record<string, unknown>;
}

/** A notification the gateway pushed at us. */
export interface ProviderNotification {
  provider: PaymentProviderName;
  /** The gateway's own id for this notification, used to spot a repeat. */
  eventId: string;
  eventType: string | null;
  /** Our reference from the original attempt. */
  reference: string | null;
  raw: Record<string, unknown>;
}

export interface RefundResult {
  provider: PaymentProviderName;
  providerRefundReference: string | null;
  amount: number;
  success: boolean;
  reason?: string | null;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** True when this provider settles to a bank or M-Pesa rather than online. */
  readonly isOffline: boolean;

  /** Opens a payment and returns where to send the payer. */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /**
   * Asks the gateway what actually happened to a transaction.
   *
   * This is the only path that may produce a VERIFIED outcome. The redirect the
   * payer comes back through must not be trusted on its own.
   */
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;

  /** Turns a pushed notification into our own shape. */
  parseNotification(payload: unknown, headers: Record<string, string | undefined>): ProviderNotification;

  /**
   * Confirms a pushed notification against the gateway.
   *
   * A notification is a claim, not proof, so it is verified the same way a
   * redirect is before anything moves.
   */
  verifyNotification(notification: ProviderNotification): Promise<VerifyPaymentResult>;

  refund(reference: string, amount: number, reason: string): Promise<RefundResult>;
}

/** Raised when a gateway cannot be reached or answers something unusable. */
export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

/**
 * Cash needs no gateway. It implements the same interface so the POS never
 * branches on payment type, which is where "cash behaves differently" bugs live.
 */
export class OfflineProvider implements PaymentProvider {
  readonly name = "CASH" as const;
  readonly isOffline = true;

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return {
      provider: this.name,
      providerReference: input.reference,
      paymentUrl: input.returnUrl,
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    // Cash is confirmed by the person who took it, recorded server-side. There is
    // nothing to call, and nothing here can pretend otherwise.
    return {
      provider: this.name,
      outcome: "ADAPTER_REDIRECT",
      providerTransactionId: reference,
      raw: { note: "Cash is confirmed by staff at the till." },
    };
  }

  parseNotification(): ProviderNotification {
    throw new ProviderUnavailableError("Cash sends no notifications", false);
  }

  async verifyNotification(): Promise<VerifyPaymentResult> {
    throw new ProviderUnavailableError("Cash sends no notifications", false);
  }

  async refund(): Promise<RefundResult> {
    return {
      provider: this.name,
      providerRefundReference: null,
      amount: 0,
      success: false,
      reason: "Cash refunds are recorded manually.",
    };
  }
}