import { useEffect, useState } from "react";


export interface PaymentAttemptStatus {
  id: string;
  status: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  failureReason: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  paymentId: string | null;
  tabId: string | null;
}

export function usePaymentAttempt(attemptId: string | null) {
  const [data, setData] = useState<PaymentAttemptStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/payments/attempts/${attemptId}`);
        if (!response.ok) {
          throw new Error("The payment status could not be read.");
        }
        const json = (await response.json()) as PaymentAttemptStatus;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "The payment status could not be read.",
          );
        }
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 3_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [attemptId]);

  return { data, error };
}