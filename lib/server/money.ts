

export interface TenantSettings {
  currency: string;
  locale: string;
  
  taxRate: number;
  
  serviceChargeRate: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  total: number;
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
  UGX_: "en-UG",
};

export function localeFor(currency: string): string {
  return LOCALE_BY_CURRENCY[currency] ?? "en";
}


export function calculateTotals(
  subtotal: number,
  discount: number,
  rates: Pick<TenantSettings, "taxRate" | "serviceChargeRate">,
): Totals {
  
  
  const appliedDiscount = Math.min(Math.max(0, discount), Math.max(0, subtotal));
  const net = Math.max(0, subtotal - appliedDiscount);
  const serviceCharge = Math.round((net * rates.serviceChargeRate) / 100);
  const tax = Math.round((net * rates.taxRate) / 100);
  return {
    subtotal,
    discount: appliedDiscount,
    serviceCharge,
    tax,
    total: net + serviceCharge + tax,
  };
}


export interface RevenueSplit {
  bar: number;
  food: number;
  pool: number;
  other: number;
}

export function splitByCategory(
  buckets: { category: string; amount: number }[],
): RevenueSplit {
  const split: RevenueSplit = { bar: 0, food: 0, pool: 0, other: 0 };
  for (const { category, amount } of buckets) {
    switch (normalizeCategory(category)) {
      case "BEER":
      case "SPIRITS":
      case "WINE":
      case "COCKTAILS":
      case "SOFT_DRINKS":
      case "WATER":
      case "SNACKS":
        split.bar += amount;
        break;
      case "FOOD":
        split.food += amount;
        break;
      case "POOL":
        split.pool += amount;
        break;
      default:
        split.other += amount;
        break;
    }
  }
  return split;
}

function normalizeCategory(category: string): string {
  const upper = category.trim().toUpperCase().replace(/[\s-]+/g, "_");
  
  
  if (["BEER", "SPIRITS", "WINE", "COCKTAILS", "SOFT_DRINKS", "WATER", "SNACKS"].includes(upper)) {
    return upper;
  }
  if (upper === "COMBOS") return "OTHER";
  return upper;
}

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


export const DEFAULT_LARGE_DISCOUNT_PERCENT = 20;

export function isLargeDiscount(
  subtotal: number,
  discount: number,
  thresholdPercent = DEFAULT_LARGE_DISCOUNT_PERCENT,
): boolean {
  if (subtotal <= 0) return false;
  return (discount / subtotal) * 100 > thresholdPercent;
}