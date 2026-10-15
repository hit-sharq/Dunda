"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CreditCard, ShieldCheck, Unplug } from "lucide-react";

type ConnectionState = "loading" | "connected" | "disconnected";

export function PesapalMerchantSettings({ isOwner }: { isOwner: boolean }) {
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    let active = true;
    void fetch("/api/settings/payments", { credentials: "include" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not check the Pesapal connection.");
        if (active) setConnection(body.configured ? "connected" : "disconnected");
      })
      .catch((error: unknown) => {
        if (active) {
          setConnection("disconnected");
          setMessage({
            ok: false,
            text: error instanceof Error ? error.message : "Could not check the Pesapal connection.",
          });
        }
      });
    return () => { active = false; };
  }, [isOwner]);

  if (!isOwner) return null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/payments", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consumerKey, consumerSecret }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not connect this Pesapal account.");
      setConnection("connected");
      setConsumerKey("");
      setConsumerSecret("");
      setMessage({ ok: true, text: "Pesapal account connected. Credentials are stored encrypted." });
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Could not connect this Pesapal account.",
      });
    } finally {
      setPending(false);
    }
  }

  async function disconnect() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/payments", {
        method: "DELETE",
        credentials: "include",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not disconnect this Pesapal account.");
      setConnection("disconnected");
      setMessage({ ok: true, text: "Pesapal account disconnected." });
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Could not disconnect this Pesapal account.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="surface grid gap-4 rounded-2xl p-5 md:p-6" data-testid="section-pesapal-settings">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-faint)]">Payments / merchant account</p>
          <h3 className="mt-1 font-display text-xl font-bold">Guest payments</h3>
          <p className="mt-2 max-w-2xl text-sm text-[var(--app-muted)]">Connect this club’s Pesapal account. Guest payments settle through this merchant account; Dunda subscription billing remains separate.</p>
        </div>
        <CreditCard className="shrink-0 text-[var(--app-gold)]" size={20} />
      </div>

      <div className="flex items-center gap-2 text-sm" role="status" data-testid="status-pesapal-connection">
        <span className={`h-2 w-2 rounded-full ${connection === "connected" ? "bg-[hsl(var(--app-success))]" : connection === "disconnected" ? "bg-[hsl(var(--app-warn))]" : "bg-[hsl(var(--app-muted))]"}`} />
        {connection === "loading" ? "Checking account…" : connection === "connected" ? "Merchant account connected" : "No merchant account connected"}
        {connection === "connected" && <ShieldCheck size={15} className="text-[var(--app-success)]" />}
      </div>

      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" data-testid="form-pesapal-credentials">
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--app-faint)]">Consumer key
          <input required autoComplete="off" value={consumerKey} onChange={(event) => setConsumerKey(event.target.value)} className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[hsl(var(--app-surface))] px-3 text-sm font-normal text-[var(--app-ink)]" data-testid="input-pesapal-consumer-key" />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--app-faint)]">Consumer secret
          <input required type="password" autoComplete="new-password" value={consumerSecret} onChange={(event) => setConsumerSecret(event.target.value)} className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[hsl(var(--app-surface))] px-3 text-sm font-normal text-[var(--app-ink)]" data-testid="input-pesapal-consumer-secret" />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={pending || !consumerKey.trim() || !consumerSecret.trim()} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[hsl(var(--app-gold))] px-4 text-sm font-semibold text-[hsl(var(--app-ink))] disabled:opacity-50" data-testid="button-connect-pesapal">{pending ? "Verifying…" : connection === "connected" ? "Verify and replace" : "Verify and connect"}</button>
          {connection === "connected" && <button type="button" disabled={pending} onClick={() => void disconnect()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--app-line)] px-3 text-sm font-semibold text-[var(--app-ink-soft)] disabled:opacity-50" data-testid="button-disconnect-pesapal"><Unplug size={15} /> Disconnect</button>}
        </div>
      </form>

      <p className="text-xs text-[var(--app-muted)]">Credentials are write-only and encrypted at rest. They are never returned to the browser. Pending payments must settle before replacing or disconnecting this account.</p>
      {message && <p role={message.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${message.ok ? "bg-[hsl(var(--app-success-soft))] text-[hsl(var(--app-success))]" : "bg-[hsl(var(--app-critical-soft))] text-[hsl(var(--app-critical))]"}`} data-testid="status-pesapal-result">{message.text}</p>}
    </section>
  );
}