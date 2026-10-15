import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGetMe } from "@/lib/api-client-react/src";


let activeLocale = "en-KE";
let activeCurrency = "KES";

export function configureMoney(locale: string, currency: string): void {
  activeLocale = locale;
  activeCurrency = currency;
}

export function activeCurrencyCode(): string {
  return activeCurrency;
}


export function money(value = 0): string {
  try {
    return new Intl.NumberFormat(activeLocale, {
      style: "currency",
      currency: activeCurrency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${activeCurrency} ${value}`;
  }
}

interface MoneyContextValue {
  currency: string;
  locale: string;
  format: (value: number) => string;
}

const MoneyContext = createContext<MoneyContextValue | null>(null);

export function MoneyProvider({ children }: { children: ReactNode }) {
  const me = useGetMe();
  const [currency, setCurrency] = useState("KES");
  const [locale, setLocale] = useState("en-KE");

  const nextCurrency = me.data?.settings?.currency ?? "KES";
  const nextLocale = me.data?.settings?.locale ?? "en-KE";

  useEffect(() => {
    configureMoney(nextLocale, nextCurrency);
    setCurrency(nextCurrency);
    setLocale(nextLocale);
  }, [nextLocale, nextCurrency]);

  const value = useMemo<MoneyContextValue>(
    () => ({ currency, locale, format: money }),
    [currency, locale],
  );

  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>;
}

export function useMoney(): MoneyContextValue {
  return useContext(MoneyContext) ?? { currency: "KES", locale: "en-KE", format: money };
}