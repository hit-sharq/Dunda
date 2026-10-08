import { ApiError } from "@/lib/errors.server";

/**
 * Pesapal API 3.0 client.
 *
 * The only thing in the system that talks to the outside
 * world over money, kept in one place: every order created
 * and every status read goes through here, and every answer
 * is recorded by the caller rather than trusted from a
 * callback.
 *
 * Three env vars run it. PESAPAL_CONSUMER_KEY and
 * PESAPAL_CONSUMER_SECRET are the app's credentials from
 * the Pesapal dashboard. PESAPAL_ENV picks the sandbox
 * ("sandbox") or the live gateway (anything else), and
 * PESAPAL_BASE_URL overrides either for testing against a
 * stub. NEXT_PUBLIC_APP_URL is the public address of this
 * deployment, which is where Pesapal sends the buyer back
 * and where it posts its notifications.
 *
 * Endpoints, per the API 3.0 documentation:
 *   Auth/RequestToken            POST   no bearer
 *   URLSetup/RegisterIPN         POST   bearer
 *   Transactions/SubmitOrderRequest  POST  bearer
 *   Transactions/GetTransactionStatus GET bearer
 */

const SANDBOX_BASE_URL = "https://cybqa.pesapal.com/pesapalv3";
const PRODUCTION_BASE_URL = "https://pay.pesapal.com/v3";

/** The provider's name as it is written on payments and attempts. */
export const PESAPAL_PROVIDER = "PESAPAL";

function baseUrl(): string {
  if (process.env.PESAPAL_BASE_URL) {
    return process.env.PESAPAL_BASE_URL.replace(/\/+$/, "");
  }
  return process.env.PESAPAL_ENV === "sandbox"
    ? SANDBOX_BASE_URL
    : PRODUCTION_BASE_URL;
}

/** Whether the deployment holds credentials at all. */
export function pesapalConfigured(): boolean {
  return Boolean(
    process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET,
  );
}

/** Where Pesapal sends the buyer back, and where it posts notifications. */
export function pesapalCallbackUrl(): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
    .replace(/\/+$/, "");
  return `${appUrl}/api/webhooks/pesapal`;
}

function requireCredentials(): void {
  if (!pesapalConfigured()) {
    throw new ApiError(
      503,
      "The payment provider is not configured on this deployment.",
      { code: "PROVIDER_NOT_CONFIGURED" },
    );
  }
}

/**
 * A provider that answers anything other than 2xx is a provider
 * problem, not a caller problem, so it leaves as a 502 with what
 * the provider said rather than as a 500 that looks like our fault.
 */
async function providerResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new ApiError(
      502,
      `Pesapal answered ${response.status}: ${text.slice(0, 200)}`,
      { code: "PROVIDER_ERROR" },
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(502, "Pesapal answered with something that was not JSON.", {
      code: "PROVIDER_ERROR",
    });
  }
}

// A token is valid for five minutes, so it is held in memory
// and reused until shortly before it expires. Two terminals
// paying at the same moment then share one token instead of
// each asking for their own.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function requestToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 30_000 > Date.now()) {
    return cachedToken.value;
  }
  requireCredentials();

  const response = await fetch(`${baseUrl()}/api/Auth/RequestToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      consumer_key: process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
    }),
  });

  const body = (await providerResponse(response)) as {
    access_token?: string;
    token?: string;
    expires_in?: number;
  };
  // The live gateway spells the token "token" where
  // the documentation says "access_token", so both
  // are read.
  const tokenValue = body.access_token ?? body.token;
  if (!tokenValue) {
    throw new ApiError(502, "Pesapal did not return an access token.", {
      code: "PROVIDER_ERROR",
    });
  }

  cachedToken = {
    value: tokenValue,
    // Pesapal issues tokens for five minutes; the default
    // covers a provider that does not say.
    expiresAt: Date.now() + (body.expires_in ?? 300) * 1000,
  };
  return cachedToken.value;
}

/**
 * The IPN registration for this deployment's callback URL.
 *
 * SubmitOrderRequest will not be accepted without a
 * notification_id, which Pesapal hands out when a
 * notification URL is registered. The id is cached for the
 * life of the process: it identifies the URL, and the URL
 * does not change between orders.
 */
let cachedIpnId: string | null = null;

async function registerIpn(): Promise<string> {
  if (cachedIpnId) return cachedIpnId;

  const token = await requestToken();
  const response = await fetch(`${baseUrl()}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: pesapalCallbackUrl(),
      // POST, so the notification reaches this server even
      // when the buyer's browser never makes it back.
      ipn_notification_type: "POST",
    }),
  });

  const body = (await providerResponse(response)) as {
    ipn_id?: string;
    error?: unknown;
  };
  if (!body.ipn_id) {
    throw new ApiError(
      502,
      "Pesapal did not register this deployment's notification URL.",
      { code: "PROVIDER_ERROR" },
    );
  }

  cachedIpnId = body.ipn_id;
  return cachedIpnId;
}

export interface PesapalSubscriptionDetails {
  /** dd-MM-yyyy, the first day the mandate covers. */
  startDate: Date;
  /** dd-MM-yyyy, the last day the mandate covers. */
  endDate: Date;
  /** How often the card is charged. */
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
}

export interface PesapalOrderInput {
  /** Our reference for the order: the attempt or billing payment id. */
  id: string;
  amount: number;
  currency: string;
  description: string;
  payerEmail?: string | null;
  payerPhone?: string | null;
  payerName?: string | null;
  /**
   * Our identifier for the account being charged,
   * which Pesapal echoes back with every automatic
   * charge. For a club's subscription this is the
   * organization id, so a recurring charge names
   * the club it belongs to.
   */
  accountNumber?: string | null;
  /**
   * Sent when the payment should offer the payer
   * an automatic renewal. The payer still accepts
   * the mandate on the payment page; this only
   * prefills what they are accepting.
   */
  subscriptionDetails?: PesapalSubscriptionDetails | null;
}

export interface PesapalOrder {
  orderTrackingId: string;
  merchantReference: string;
  redirectUrl: string;
  status: string;
}

function formatDay(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  // The provider spells dates dd-MM-yyyy.
  return `${day}-${month}-${year}`;
}

/**
 * Creates an order and returns where the buyer should be sent.
 *
 * The amount is sent as the club's own whole units with two
 * decimals appended, because Pesapal prices in major currency
 * units and the books keep whole units: 18000 is KES 18,000
 * on both sides of the call.
 */
export async function createOrder(input: PesapalOrderInput): Promise<PesapalOrder> {
  const [token, notificationId] = await Promise.all([
    requestToken(),
    registerIpn(),
  ]);

  const [firstName, ...rest] = (input.payerName ?? "").split(/\s+/);
  const response = await fetch(
    `${baseUrl()}/api/Transactions/SubmitOrderRequest`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        // The provider only accepts alphanumerics, dashes,
        // underscores, dots and colons here, and a uuid is
        // exactly that.
        id: input.id,
        currency: input.currency,
        amount: Number(input.amount.toFixed(2)),
        description: input.description.slice(0, 100),
        callback_url: pesapalCallbackUrl(),
        cancellation_url: pesapalCallbackUrl(),
        notification_id: notificationId,
        // The account the charge belongs to, which is
        // what an automatic charge names us back by.
        account_number: input.accountNumber ?? "",
        // Offered when the payer should be asked to
        // renew automatically. They still accept on
        // the payment page; this prefills the terms.
        subscription_details: input.subscriptionDetails
          ? {
              start_date: formatDay(input.subscriptionDetails.startDate),
              end_date: formatDay(input.subscriptionDetails.endDate),
              frequency: input.subscriptionDetails.frequency,
            }
          : undefined,
        billing_address: {
          email_address: input.payerEmail ?? "",
          phone_number: input.payerPhone ?? "",
          first_name: firstName ?? "",
          middle_name: "",
          last_name: rest.join(" "),
          country_code: "KE",
          line_1: "",
          line_2: "",
          city: "",
          state: "",
          postal_code: "",
          zip_code: "",
        },
      }),
    },
  );

  const body = (await providerResponse(response)) as {
    order_tracking_id?: string;
    merchant_reference?: string;
    redirect_url?: string;
    error?: { message?: string } | null;
    status?: string;
  };

  // The provider reports its own failures in a 200 body,
  // so the answer is checked rather than the HTTP status.
  if (body.error || body.status !== "200") {
    throw new ApiError(
      502,
      `Pesapal did not create the order: ${
        body.error?.message ?? body.status ?? "no reason given"
      }`,
      { code: "PROVIDER_ERROR" },
    );
  }

  const orderTrackingId = asString(body.order_tracking_id);
  const redirectUrl = asString(body.redirect_url);
  if (!orderTrackingId || !redirectUrl) {
    throw new ApiError(
      502,
      "Pesapal created no order we can send the buyer to.",
      { code: "PROVIDER_ERROR" },
    );
  }

  return {
    orderTrackingId,
    merchantReference: asString(body.merchant_reference) ?? input.id,
    redirectUrl,
    status: "200",
  };
}

export interface PesapalRecurringInfo {
  /** Our account number, echoed back. */
  accountReference: string | null;
  amount: number | null;
  firstName: string | null;
  lastName: string | null;
  /** The provider's recurring payment identifier. */
  correlationId: string | null;
}

export interface PesapalOrderStatus {
  orderTrackingId: string;
  /** The provider's own spelling, kept as it arrived. */
  status: string;
  paymentMethod: string | null;
  paymentAmount: number | null;
  paymentCurrency: string | null;
  paymentReference: string | null;
  transactionId: string | null;
  paymentAccount: string | null;
  description: string | null;
  /** Present on automatic charges. */
  subscriptionTransactionInfo: PesapalRecurringInfo | null;
  raw: unknown;
}

/**
 * Reads an order's status from Pesapal.
 *
 * This is the only answer the system acts on. A callback —
 * browser or notification — is a nudge that says "go and
 * look"; the status read here is what settles the money.
 * Pesapal deliberately sends no status with the callback,
 * so there is nothing to trust but this.
 */
export async function getOrderStatus(
  orderTrackingId: string,
): Promise<PesapalOrderStatus> {
  const token = await requestToken();

  const response = await fetch(
    `${baseUrl()}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const body = (await providerResponse(response)) as {
    order_tracking_id?: string;
    payment_method?: string;
    amount?: number;
    currency?: string;
    confirmation_code?: string;
    payment_status_description?: string;
    description?: string;
    payment_account?: string;
    merchant_reference?: string;
    status_code?: number;
    subscription_transaction_info?: {
      account_reference?: string;
      amount?: number;
      first_name?: string;
      last_name?: string;
      correlation_id?: string | number;
    } | null;
    error?: { message?: string } | null;
  };

  // The status arrives as a description and a code that
  // agree with each other: 1 is COMPLETED, 2 is FAILED,
  // 3 is REVERSED, 0 is INVALID.
  const status = asString(body.payment_status_description) ?? statusCodeLabel(body.status_code);
  if (!status) {
    throw new ApiError(
      502,
      body.error?.message ?? "Pesapal answered without a status for that order.",
      { code: "PROVIDER_ERROR" },
    );
  }

  const recurring = body.subscription_transaction_info;
  return {
    orderTrackingId: asString(body.order_tracking_id) ?? orderTrackingId,
    status,
    paymentMethod: asString(body.payment_method) ?? null,
    paymentAmount: asNumber(body.amount),
    paymentCurrency: asString(body.currency) ?? null,
    paymentReference: asString(body.confirmation_code) ?? null,
    transactionId: asString(body.confirmation_code) ?? null,
    paymentAccount: asString(body.payment_account) ?? null,
    description: asString(body.description) ?? null,
    subscriptionTransactionInfo: recurring
      ? {
          accountReference: asString(recurring.account_reference) ?? null,
          amount: asNumber(recurring.amount),
          firstName: asString(recurring.first_name) ?? null,
          lastName: asString(recurring.last_name) ?? null,
          correlationId:
            asString(recurring.correlation_id) ??
            (typeof recurring.correlation_id === "number"
              ? String(recurring.correlation_id)
              : null),
        }
      : null,
    raw: body,
  };
}

function statusCodeLabel(code: number | undefined): string | null {
  switch (code) {
    case 1:
      return "COMPLETED";
    case 2:
      return "FAILED";
    case 3:
      return "REVERSED";
    case 0:
      return "INVALID";
    default:
      return null;
  }
}

/** The provider's spellings of "the money arrived". */
const COMPLETED_STATUSES = new Set(["COMPLETED", "SUCCESS", "SUCCESSFUL"]);
/**
 * The provider's spellings of "the money did not
 * arrive, or arrived and went back".
 *
 * INVALID is deliberately absent: it is the state of
 * every order that has not been paid yet, so it means
 * "still waiting", not "failed". An abandoned order
 * stays open and shows up in the operator's stuck
 * payments rather than as a failure.
 */
const FAILED_STATUSES = new Set([
  "FAILED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "DECLINED",
  "REVERSED",
]);

export function isCompletedStatus(status: string): boolean {
  return COMPLETED_STATUSES.has(status.trim().toUpperCase());
}

export function isFailedStatus(status: string): boolean {
  return FAILED_STATUSES.has(status.trim().toUpperCase());
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
      ? Number(value)
      : null;
}
