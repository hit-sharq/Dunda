"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Card } from "@/components/ui/card";

interface CollectPaymentProps {
  tabId: string;
  tableName?: string | null;
}

/**
 * The waiter taps this on a table to bring the payment QR to the customer.
 * The customer scans it, pays with M-Pesa, and the tab settles.
 */
export function CollectPayment({ tabId, tableName }: CollectPaymentProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    payUrl: string;
    amount: number;
    method: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function collect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tabs/${tabId}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", credentials: "include" },
        body: JSON.stringify({ method: "MPESA" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the payment");
      const absolute = `${window.location.origin}${data.payUrl}`;
      setResult({
        payUrl: absolute,
        amount: data.amount,
        method: data.method,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
      result.payUrl,
    )}`;

    return (
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[hsl(var(--app-ink))]">
            Scan to pay
            {tableName ? ` · ${tableName}` : ""}
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
            New
          </Button>
        </div>

        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt="Payment QR code"
            className="h-[220px] w-[220px] rounded-xl bg-white p-2"
          />
          <p className="text-2xl font-extrabold text-[hsl(var(--app-ink))]">
            KES {result.amount.toLocaleString()}
          </p>
          <p className="text-center text-xs text-[hsl(var(--app-faint))]">
            Customer scans with their phone camera and pays with M-Pesa.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(result.payUrl);
            }}
            className="w-full"
          >
            Copy payment link
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-bold text-[hsl(var(--app-ink))]">
        Collect payment
        {tableName ? ` · ${tableName}` : ""}
      </h3>
      <Button
        variant="primary"
        size="sm"
        onClick={collect}
        disabled={loading}
        className="w-full"
      >
        {loading ? "Preparing QR..." : "Show payment QR"}
      </Button>
      {error ? (
        <p className="mt-2 text-xs text-[hsl(var(--app-critical))]">{error}</p>
      ) : null}
    </Card>
  );
}
