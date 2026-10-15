"use client";

import { useEffect, useState, type FormEvent } from "react";
import { SignIn, SignUp, useAuth } from "@clerk/react";
import { Link } from "wouter";
import { Button, PageIntro } from "@/components/ui";

type SetupDetails = {
  ownerEmail: string;
  ownerName: string | null;
  expiresAt: string;
  plan: { name: string; monthlyPrice: number; annualPrice: number; currency: string };
};

type SetupResult = {
  organization: { id: string; name: string; slug: string };
  trialEndsAt: string;
  plan: { name: string; monthlyPrice: number; currency: string };
  payment: { redirectUrl: string; amount: number; currency: string } | null;
  paymentFailed: boolean;
};

const initialForm = {
  name: "",
  branchName: "Main Branch",
  city: "",
  currency: "KES",
  taxRate: "16",
  serviceChargeRate: "10",
};

export function OwnerSetup({ token, signInMode = false }: { token: string; signInMode?: boolean }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [details, setDetails] = useState<SetupDetails | null>(null);
  const [form, setForm] = useState(initialForm);
  const [autoRenew, setAutoRenew] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const setupPath = `/setup/${encodeURIComponent(token)}`;

  useEffect(() => {
    let active = true;
    void fetch(`/api/setup/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "This setup link is unavailable.");
        if (active) setDetails(body as SetupDetails);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "This setup link is unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const clerkToken = await getToken();
      if (!clerkToken) throw new Error("Your sign-in has expired. Sign in again to continue.");
      const response = await fetch(`/api/setup/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${clerkToken}`,
        },
        body: JSON.stringify({
          name: form.name,
          branchName: form.branchName,
          city: form.city,
          currency: form.currency,
          taxRate: Number(form.taxRate),
          serviceChargeRate: Number(form.serviceChargeRate),
          autoRenew,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "We could not finish setting up the club.");
      setResult(body as SetupResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not finish setting up the club.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !isLoaded) {
    return <div className="grid min-h-[100dvh] place-items-center text-sm text-[var(--app-ink-soft)]">Checking your setup link…</div>;
  }

  if (error && !details && !result) {
    return <main className="mx-auto grid min-h-[100dvh] max-w-xl content-center gap-4 p-5">
      <section className="surface rounded-2xl p-6">
        <h1 className="font-display text-2xl font-bold">This setup link isn’t available</h1>
        <p className="mt-2 text-sm text-[var(--app-ink-soft)]">{error}</p>
        <p className="mt-4 text-sm text-[var(--app-muted)]">Ask the person who sent it to issue a new link.</p>
      </section>
    </main>;
  }

  if (result) {
    return <main className="mx-auto grid min-h-[100dvh] max-w-xl content-center gap-4 p-5">
      <section className="surface grid gap-4 rounded-2xl p-6">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-success)]">Owner setup complete</p>
        <h1 className="font-display text-2xl font-bold">{result.organization.name} is ready</h1>
        <p className="text-sm text-[var(--app-ink-soft)]">Your {result.plan.name} trial is active until {new Date(result.trialEndsAt).toLocaleDateString()}.</p>
        {result.payment && <a href={result.payment.redirectUrl} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[hsl(var(--app-gold))] px-4 text-sm font-semibold text-[hsl(var(--app-ink))]" data-testid="link-owner-first-payment">Continue to first payment · {result.payment.currency} {result.payment.amount.toLocaleString()}</a>}
        {result.paymentFailed && <p role="status" className="rounded-xl bg-[hsl(var(--app-warn-soft))] p-3 text-sm text-[hsl(var(--app-warn))]">The club is ready, but checkout could not start. You can request the subscription payment from your club home screen.</p>}
        <Link href="/overview" className="text-sm font-semibold text-[var(--app-success)]">Go to your club</Link>
      </section>
    </main>;
  }

  if (!isSignedIn) {
    return <main className="mx-auto grid min-h-[100dvh] max-w-xl content-center gap-5 p-5">
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-gold)]">Owner invitation</p>
        <h1 className="font-display text-3xl font-bold">Set up your club</h1>
        <p className="mt-2 text-sm text-[var(--app-ink-soft)]">This invitation is for <strong>{details?.ownerEmail}</strong>. Create or sign in to that account to continue.</p>
      </div>
      <section className="surface overflow-hidden rounded-2xl p-5">
        {signInMode ? (
          <SignIn
            routing="hash"
            signUpUrl={setupPath}
            forceRedirectUrl={setupPath}
            initialValues={{ emailAddress: details?.ownerEmail ?? "" }}
          />
        ) : (
          <SignUp
            routing="hash"
            signInUrl={`${setupPath}/sign-in`}
            forceRedirectUrl={setupPath}
            initialValues={{ emailAddress: details?.ownerEmail ?? "" }}
          />
        )}
      </section>
    </main>;
  }

  return <main className="mx-auto max-w-3xl p-5 md:p-8">
    <PageIntro
      eyebrow="Owner invitation / club setup"
      title="Build your club profile"
      detail={`Signed in as ${details?.ownerEmail}. This one-time link starts a 14-day ${details?.plan.name} trial.`}
    />
    <form onSubmit={submit} className="surface grid gap-4 rounded-2xl p-5 md:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold">Club name
          <input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[hsl(var(--app-surface))] px-3 text-sm font-normal" placeholder="The Lantern Room" data-testid="input-setup-club-name" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">First branch
          <input required minLength={2} maxLength={120} value={form.branchName} onChange={(event) => setForm({ ...form, branchName: event.target.value })} className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[hsl(var(--app-surface))] px-3 text-sm font-normal" data-testid="input-setup-branch-name" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1.5 text-sm font-semibold">City
          <input maxLength={120} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[hsl(var(--app-surface))] px-3 text-sm font-normal" placeholder="Nairobi" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">Currency
          <input required minLength={3} maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase().slice(0, 3) })} className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[hsl(var(--app-surface))] px-3 text-sm font-normal" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">Tax rate (%)
          <input type="number" min={0} max={100} value={form.taxRate} onChange={(event) => setForm({ ...form, taxRate: event.target.value })} className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[hsl(var(--app-surface))] px-3 text-sm font-normal" />
        </label>
      </div>
      <label className="grid max-w-sm gap-1.5 text-sm font-semibold">Service charge (%)
        <input type="number" min={0} max={100} value={form.serviceChargeRate} onChange={(event) => setForm({ ...form, serviceChargeRate: event.target.value })} className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[hsl(var(--app-surface))] px-3 text-sm font-normal" />
      </label>
      <div className="rounded-xl border border-[var(--app-line)] p-4">
        <p className="text-sm font-semibold">{details?.plan.name} plan</p>
        <p className="mt-1 text-sm text-[var(--app-muted)]">{details?.plan.currency} {details?.plan.monthlyPrice.toLocaleString()} per month after the 14-day trial.</p>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-[var(--app-line)] p-4 text-sm">
        <input type="checkbox" checked={autoRenew} onChange={(event) => setAutoRenew(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--app-gold))]" data-testid="checkbox-owner-auto-renew" />
        <span><span className="block font-semibold">Offer automatic renewal</span><span className="mt-1 block text-xs font-normal text-[var(--app-muted)]">Pesapal will ask you to accept the recurring card mandate during checkout. Dunda only marks it active after Pesapal confirms it.</span></span>
      </label>
      {error && <p role="alert" className="rounded-xl border border-[hsl(var(--app-critical-soft))] bg-[hsl(var(--app-critical-soft))] p-3 text-sm text-[hsl(var(--app-critical))]">{error}</p>}
      <Button type="submit" disabled={submitting} data-testid="button-create-owner-club">{submitting ? "Setting up your club…" : "Create club and continue"}</Button>
    </form>
  </main>;
}