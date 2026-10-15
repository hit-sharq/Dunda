import { ApiError } from "@/lib/errors.server";
import {
  pesapalCredentialFingerprint,
  type PesapalCredentials,
} from "@/lib/server/pesapal-credentials";



const SANDBOX_BASE_URL = "https://cybqa.pesapal.com/pesapalv3";
const PRODUCTION_BASE_URL = "https://pay.pesapal.com/v3";


export const PESAPAL_PROVIDER = "PESAPAL";

function baseUrl(): string {
  if (process.env.PESAPAL_BASE_URL) {
    return process.env.PESAPAL_BASE_URL.replace(/\/+$/, "");
  }
  return process.env.PESAPAL_ENV === "sandbox"
    ? SANDBOX_BASE_URL
    : PRODUCTION_BASE_URL;
}


export function pesapalConfigured(credentials?: PesapalCredentials): boolean {
  return credentials
    ? Boolean(credentials.consumerKey && credentials.consumerSecret)
    : Boolean(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET);
}


export function pesapalCallbackUrl(): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
    .replace(/\/+$/, "");
  return `${appUrl}/api/webhooks/pesapal`;
}

function platformCredentials(): PesapalCredentials {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new ApiError(
      503,
      "The payment provider is not configured on this deployment.",
      { code: "PROVIDER_NOT_CONFIGURED" },
    );
  }
  return { consumerKey, consumerSecret };
}


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





const cachedTokens = new Map<string, { value: string; expiresAt: number }>();

async function requestToken(credentials?: PesapalCredentials): Promise<string> {
  const merchantCredentials = credentials ?? platformCredentials();
  if (!pesapalConfigured(merchantCredentials)) {
    throw new ApiError(503, "Pesapal credentials are incomplete.", {
      code: "PROVIDER_NOT_CONFIGURED",
    });
  }
  const fingerprint = pesapalCredentialFingerprint(merchantCredentials);
  const cached = cachedTokens.get(fingerprint);
  if (cached && cached.expiresAt - 30_000 > Date.now()) return cached.value;

  const response = await fetch(`${baseUrl()}/api/Auth/RequestToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      consumer_key: merchantCredentials.consumerKey,
      consumer_secret: merchantCredentials.consumerSecret,
    }),
  });

  const body = (await providerResponse(response)) as {
    access_token?: string;
    token?: string;
    expires_in?: number;
  };
  
  
  
  const tokenValue = body.access_token ?? body.token;
  if (!tokenValue) {
    throw new ApiError(502, "Pesapal did not return an access token.", {
      code: "PROVIDER_ERROR",
    });
  }

  cachedTokens.set(fingerprint, {
    value: tokenValue,
    
    
    expiresAt: Date.now() + (body.expires_in ?? 300) * 1000,
  });
  return tokenValue;
}


const cachedIpnIds = new Map<string, string>();

async function registerIpn(credentials?: PesapalCredentials): Promise<string> {
  const merchantCredentials = credentials ?? platformCredentials();
  const fingerprint = pesapalCredentialFingerprint(merchantCredentials);
  const cached = cachedIpnIds.get(fingerprint);
  if (cached) return cached;

  const token = await requestToken(merchantCredentials);
  const response = await fetch(`${baseUrl()}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: pesapalCallbackUrl(),
      
      
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

  cachedIpnIds.set(fingerprint, body.ipn_id);
  return body.ipn_id;
}

export async function verifyPesapalCredentials(
  credentials: PesapalCredentials,
): Promise<void> {
  await registerIpn(credentials);
}

export interface PesapalSubscriptionDetails {
  
  startDate: Date;
  
  endDate: Date;
  
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
}

export interface PesapalOrderInput {
  
  id: string;
  amount: number;
  currency: string;
  description: string;
  payerEmail?: string | null;
  payerPhone?: string | null;
  payerName?: string | null;
  credentials?: PesapalCredentials;
  
  accountNumber?: string | null;
  
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
  
  return `${day}-${month}-${year}`;
}


export async function createOrder(input: PesapalOrderInput): Promise<PesapalOrder> {
  const [token, notificationId] = await Promise.all([
    requestToken(input.credentials),
    registerIpn(input.credentials),
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
        
        
        
        id: input.id,
        currency: input.currency,
        amount: Number(input.amount.toFixed(2)),
        description: input.description.slice(0, 100),
        callback_url: pesapalCallbackUrl(),
        cancellation_url: pesapalCallbackUrl(),
        notification_id: notificationId,
        
        
        account_number: input.accountNumber ?? "",
        
        
        
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
  
  accountReference: string | null;
  amount: number | null;
  firstName: string | null;
  lastName: string | null;
  
  correlationId: string | null;
}

export interface PesapalOrderStatus {
  orderTrackingId: string;
  
  status: string;
  paymentMethod: string | null;
  paymentAmount: number | null;
  paymentCurrency: string | null;
  paymentReference: string | null;
  transactionId: string | null;
  paymentAccount: string | null;
  description: string | null;
  
  subscriptionTransactionInfo: PesapalRecurringInfo | null;
  raw: unknown;
}


export async function getOrderStatus(
  orderTrackingId: string,
  credentials?: PesapalCredentials,
): Promise<PesapalOrderStatus> {
  const token = await requestToken(credentials);

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

export interface PesapalRefundInput {
  
  confirmationCode: string;
  amount: number;
  
  username: string;
  remarks: string;
  credentials: PesapalCredentials;
}


export async function refundPayment(
  input: PesapalRefundInput,
): Promise<string> {
  const token = await requestToken(input.credentials);

  const response = await fetch(`${baseUrl()}/api/Transactions/RefundRequest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      confirmation_code: input.confirmationCode,
      amount: Number(input.amount.toFixed(2)),
      username: input.username,
      remarks: input.remarks,
    }),
  });

  const body = (await providerResponse(response)) as {
    error?: number | string;
    message?: string;
  };

  
  
  
  const code = Number(body.error);
  if (code === 500) {
    throw new ApiError(
      502,
      `Pesapal rejected the refund: ${body.message ?? "no reason given"}`,
      { code: "PROVIDER_REFUND_REJECTED" },
    );
  }

  return body.message ?? "Refund request received";
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


const COMPLETED_STATUSES = new Set(["COMPLETED", "SUCCESS", "SUCCESSFUL"]);

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