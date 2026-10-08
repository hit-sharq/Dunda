import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface SubscriptionPaymentState {
  subscription: {
    id: string;
    plan: string;
    planId: string | null;
    status: string;
    billingCycle: string;
    amount: number;
    currency: string;
    autoRenew: boolean;
    startedAt: string | null;
    trialEndsAt: string | null;
    renewsAt: string | null;
    failedPaymentCount: number;
  } | null;
  payment: {
    billingPaymentId: string;
    orderTrackingId: string;
    redirectUrl: string;
    amount: number;
    currency: string;
    createdAt: string;
  } | null;
}

/**
 * The club's own subscription and the payment link it owes.
 *
 * Polled because the payment is completed on Pesapal's
 * pages rather than here: the link only disappears once
 * the provider's answer reaches the webhook, which can
 * be a few seconds after the owner returns from paying.
 */
export function useSubscriptionPayment(enabled: boolean) {
  return useQuery<SubscriptionPaymentState>({
    queryKey: ['subscriptionPayment'],
    queryFn: async () => {
      const response = await fetch('/api/billing');
      if (!response.ok) throw new Error('The subscription could not be read.');
      return (await response.json()) as SubscriptionPaymentState;
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Asks for a payment link when none is open. */
export function useRequestSubscriptionPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/billing', { method: 'POST' });
      if (!response.ok) throw new Error('The payment link could not be created.');
      return (await response.json()) as { redirectUrl: string };
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['subscriptionPayment'] }),
  });
}
