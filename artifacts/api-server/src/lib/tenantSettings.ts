import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { organizationsTable } from "@workspace/db";

export interface TenantSettings {
  currency: string;
  locale: string;
  /** Whole percent, e.g. 16 for 16% VAT. */
  taxRate: number;
  /** Whole percent, e.g. 10 for a 10% service charge. */
  serviceChargeRate: number;
}

const cache = new Map<string, { value: TenantSettings; expiresAt: number }>();
const TTL_MS = 30_000;

/**
 * Reads the organization's commercial settings.
 *
 * Tax and service charge used to be module-level constants, which meant every
 * venue was charged the same rates regardless of what was configured for it,
 * and the per-organization columns were never read. These now come from the
 * organization row and are resolved once per request.
 */
export async function getTenantSettings(
  organizationId: string,
): Promise<TenantSettings> {
  const hit = cache.get(organizationId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const [org] = await db
    .select({
      currency: organizationsTable.currency,
      taxRate: organizationsTable.taxRate,
      serviceChargeRate: organizationsTable.serviceChargeRate,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId));

  const value: TenantSettings = {
    currency: org?.currency || "KES",
    taxRate: org?.taxRate ?? 0,
    serviceChargeRate: org?.serviceChargeRate ?? 0,
    locale: LOCALE_BY_CURRENCY[org?.currency ?? "KES"] ?? "en",
  };

  cache.set(organizationId, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

/**
 * Formats money for server-produced strings (audit entries, search subtitles).
 * Clients render their own amounts from the numeric value and the currency
 * code, so this only covers text the API has to embed.
 */
export function formatMoney(
  amount: number,
  settings: Pick<TenantSettings, "currency" | "locale">,
): string {
  try {
    return new Intl.NumberFormat(settings.locale, {
      style: "currency",
      currency: settings.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${settings.currency} ${amount}`;
  }
}

/** Computes the charge breakdown for a subtotal using the tenant's rates. */
export function calculateTotals(
  subtotal: number,
  discount: number,
  settings: Pick<TenantSettings, "taxRate" | "serviceChargeRate">,
): { subtotal: number; discount: number; serviceCharge: number; tax: number; total: number } {
  const net = Math.max(0, subtotal - discount);
  const serviceCharge = Math.round((net * settings.serviceChargeRate) / 100);
  const tax = Math.round((net * settings.taxRate) / 100);
  return { subtotal, discount, serviceCharge, tax, total: net + serviceCharge + tax };
}

const LOCALE_BY_CURRENCY: Record<string, string> = {
  KES: "en-KE",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  NGN: "en-NG",
  UGX: "en-UG",
  ZAR: "en-ZA",
  TZS: "en-TZ",
};
