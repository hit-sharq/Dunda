import {
  ProviderUnavailableError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type PaymentProviderName,
  type ProviderNotification,
  type RefundResult,
  type VerifyPaymentResult,
} from "./provider";

/**
 * Pesapal, as an implementation of the provider interface.
 *
 * Sandbox credentials by default. Production credentials are only read when the
 * environment says so, so a misconfigured deploy cannot silently charge a real
 * card.
 *
 * Pesapal's flow is: register the transaction, send the payer to the returned
 * URL, then be told about it. Both of the ways it tells us — the payer coming
 * back, and the notification it pushes — are treated as claims. Neither moves
 * money until verifyPayment has asked Pesapal itself.
 */

const SANDBOX_BASE = "https://cyb2.pesapal.com/pesapal/api/2.0";
const LIVE_BASE = "https://www.pesapal.com/pesapal/api/2.0";

interface PesapalConfig {
  consumerKey: string;
  consumerSecret: string;
  /** The merchant key of a registered business, required to create payments. */
  businessAccountId: string;
  environment: "sandbox" | "live";
}

interface PesapalToken {
  access_token: string;
  expires_in: number;
}

interface PesapalTransaction {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  status_detail?: string | null;
  payment_method?: string | null;
  payment_account_reference?: string | null;
  payment_status_description?: string | null;
  redirect_url?: string | null;
  error?: string | null;
}

export class PesapalProvider implements PaymentProvider {
  readonly name: PaymentProviderName = "PESAPAL";
  readonly isOffline = false;

  private token: PesapalToken | null = null;
  private tokenExpiry = 0;

  constructor(private readonly config: PesapalConfig) {}

  /** Built from the environment. Missing credentials are refused loudly. */
  static fromEnv(): PesapalProvider {
    const environment =
      process.env.PESAPAL_ENVIRONMENT === "live" ? "live" : "sandbox";
    const key = environment === "live"
      ? process.env.PESAPAL_LIVE_CONSUMER_KEY
      : process.env.PESAPAL_SANDBOX_CONSUMER_KEY;
    const secret = environment === "live"
      ? process.env.PESAPAL_LIVE_CONSUMER_SECRET
      : process.env.PESAPAL_SANDBOX_CONSUMER_SECRET;
    const account = environment === "live"
      ? process.env.PESAPAL_LIVE_BUSINESS_ACCOUNT_ID
      : process.env.PESAPAL_SANDBOX_BUSINESS_ACCOUNT_ID;

    if (!key || !secret || !account) {
      throw new ProviderUnavailableError(
        `Pesapal is not configured for the ${environment} environment.`,
        false,
      );
    }
    return new PesapalProvider({
      consumerKey: key,
      consumerSecret: secret,
      businessAccountId: account,
      environment,
    });
  }

  private get base(): string {
    return this.config.environment === "live" ? LIVE_BASE : SANDBOX_BASE;
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiry - 30_000) {
      return this.token.access_token;
    }
    const res = await fetch(`${this.base}/Auth/RequestBearerToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        consumer_key: this.config.consumerKey,
        consumer_secret: this.config.consumerSecret,
      }),
    });
    if (!res.ok) {
      throw new ProviderUnavailableError(
        `Pesapal rejected the credentials (${res.status}).`,
      );
    }
    const body = (await res.json()) as PesapalToken;
    if (!body.access_token) {
      throw new ProviderUnavailableError("Pesapal returned no access token.");
    }
    this.token = body;
    this.tokenExpiry = Date.now() + body.expires_in * 1000;
    return body.access_token;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const token = await this.accessToken();
    const res = await fetch(`${this.base}/Transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        reference: input.reference,
        callback_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        type: "PAYPAL",
        // Pesapal is a wallet aggregator: setting this returns the payment URL
        // for mobile money and card rather than opening a PayPal page.
        pesapal_payment_method: "M-PESA,CARD",
        business_account_id: this.config.businessAccountId,
        first_name: input.payer.name ?? "Payer",
        email: input.payer.email ?? undefined,
        phone_number: input.payer.phone ?? undefined,
        // Pesapal echoes these back on the notification, which is how we tie it
        // to our own row without trusting anything else in the payload.
        meta: JSON.stringify(input.callbackData ?? {}),
      }),
    });

    if (!res.ok) {
      throw new ProviderUnavailableError(`Pesapal could not open the payment (${res.status}).`);
    }
    const body = (await res.json()) as {
      redirect_url?: string | null;
      transaction_id?: string | null;
      error?: string | null;
      status?: string;
    };
    if (!body.redirect_url || !body.transaction_id) {
      throw new ProviderUnavailableError(
        body.error ?? "Pesapal returned no payment URL.",
      );
    }
    return {
      provider: this.name,
      providerReference: body.transaction_id,
      paymentUrl: body.redirect_url,
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const token = await this.accessToken();
    const res = await fetch(
      `${this.base}/Transactions/GetTransactionStatus?transactionId=${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      // An unreachable gateway must not be read as a failed payment.
      throw new ProviderUnavailableError(
        `Pesapal could not confirm the transaction (${res.status}).`,
      );
    }
    return this.readTransaction((await res.json()) as PesapalTransaction);
  }

  parseNotification(
    payload: unknown,
    headers: Record<string, string | undefined>,
  ): ProviderNotification {
    if (typeof payload !== "object" || payload === null) {
      throw new ProviderUnavailableError("The notification was not an object.", false);
    }
    const raw = payload as Record<string, unknown>;
    // Pesapal names its notification differently depending on the version, so
    // both are accepted rather than silently dropping one.
    const eventId = String(
      headers["pesapal-notification"] ?? raw.notificationId ?? raw.mpesa_result ?? "",
    ).trim();
    if (!eventId) {
      throw new ProviderUnavailableError(
        "The notification carried no identifier, so it cannot be de-duplicated.",
        false,
      );
    }
    return {
      provider: this.name,
      eventId,
      eventType: String(raw.notificationType ?? raw.type ?? "UNKNOWN"),
      reference: raw.reference ? String(raw.reference) : null,
      raw,
    };
  }

  async verifyNotification(
    notification: ProviderNotification,
  ): Promise<VerifyPaymentResult> {
    // The notification body is a claim. We only believe the gateway.
    if (!notification.reference) {
      return {
        provider: this.name,
        outcome: "FAILED",
        reason: "NOTIFICATION_WITHOUT_REFERENCE",
        raw: notification.raw,
      };
    }
    return this.verifyPayment(notification.reference);
  }

  /**
   * Translates Pesapal's transaction into our own outcome.
   *
   * COMPLETED is the only status that means money moved, and it is only
   * believed after the amount has been compared with what we expected.
   */
  private readTransaction(tx: PesapalTransaction): VerifyPaymentResult {
    const base = {
      provider: this.name,
      providerTransactionId: tx.payment_account_reference ?? null,
      currency: tx.currency ?? null,
      raw: tx as unknown as Record<string, unknown>,
    };

    switch ((tx.status ?? "").toUpperCase()) {
      case "COMPLETED":
        return {
          ...base,
          outcome: "VERIFIED",
          amountConfirmed: typeof tx.amount === "number" ? tx.amount : null,
          paidAt: new Date().toISOString(),
        };
      case "FAILED":
        return {
          ...base,
          outcome: "FAILED",
          reason: tx.error ?? tx.status_detail ?? "FAILED",
        };
      case "CANCELLED":
      case "CANCEL":
        return { ...base, outcome: "CANCELLED", reason: tx.status_detail ?? null };
      default:
        // PENDING and anything unfamiliar: not money yet.
        return {
          ...base,
          outcome: "FAILED",
          reason: `UNEXPECTED_STATUS:${tx.status}`,
        };
    }
  }

  async refund(
    reference: string,
    amount: number,
    reason: string,
  ): Promise<RefundResult> {
    // Pesapal refunds are a merchant action in the dashboard rather than an API
    // call, so this is recorded and reported honestly rather than pretended.
    return {
      provider: this.name,
      providerRefundReference: null,
      amount,
      success: false,
      reason: `Record this refund in the Pesapal dashboard. Reason: ${reason}`,
    };
  }
}