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
    autoRenewPending: boolean;
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


export function useRequestSubscriptionPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (autoRenew: boolean) => {
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ autoRenew }),
      });
      if (!response.ok) throw new Error('The payment link could not be created.');
      return (await response.json()) as { redirectUrl: string };
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['subscriptionPayment'] }),
  });
}