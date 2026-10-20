import { prisma } from "@/lib/db/client";
import { notFound as nextNotFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
}: {
  params: { attemptId: string };
}) {
  const attempt = await prisma.dunda_payment_attempts.findUnique({
    where: { id: params.attemptId },
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
      status: true,
      tab_id: true,
      organization_id: true,
      dunda_tabs: {
        select: {
          number: true,
          table_name: true,
          total: true,
          amount_paid: true,
          outstanding: true,
          dunda_branches: {
            select: { name: true, dunda_organizations: { select: { name: true } } },
          },
        },
      },
    },
  });

  if (!attempt) return nextNotFound();

  const club = attempt.dunda_tabs?.dunda_branches.dunda_organizations.name ?? "Your club";
  const branch = attempt.dunda_tabs?.dunda_branches.name ?? "";
  const currency = attempt.currency;
  const money = (amount: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);

  const settled = attempt.status === "RESOLVED";

  return (
    <main className="min-h-dvh bg-[hsl(var(--app-bg))] px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <p className="text-[10px] font-mono uppercase tracking-[.2em] text-[hsl(var(--app-faint))]">
            {club}
            {branch ? ` · ${branch}` : ""}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[hsl(var(--app-ink))]">
            Settle your bill
          </h1>
          {attempt.dunda_tabs ? (
            <p className="mt-1 text-sm text-[hsl(var(--app-faint))]">
              {attempt.dunda_tabs.table_name} · {attempt.dunda_tabs.number}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-5">
          <p className="text-center text-[10px] font-mono uppercase tracking-[.2em] text-[hsl(var(--app-faint))]">
            Amount due
          </p>
          <p className="mt-1 text-center text-4xl font-extrabold tracking-tight text-[hsl(var(--app-ink))]">
            {money(attempt.amount)}
          </p>

          {settled ? (
            <div className="mt-5 rounded-xl bg-[hsl(var(--app-green-soft))] px-4 py-3 text-center">
              <p className="text-sm font-bold text-[hsl(var(--app-green))]">
                Payment received
              </p>
              <p className="mt-0.5 text-xs text-[hsl(var(--app-green))]">
                Thank you. Your server has been notified.
              </p>
            </div>
          ) : (
            <button
              id="pay-now"
              className="mt-5 w-full rounded-xl bg-[hsl(var(--app-gold))] px-5 py-4 text-base font-bold text-[hsl(var(--app-ink))] disabled:opacity-50"
              data-attempt={attempt.id}
            >
              Pay {money(attempt.amount)} with M-Pesa
            </button>
          )}

          <p className="mt-3 text-center text-[11px] text-[hsl(var(--app-faint))]">
            You will be taken to your mobile money app to approve the payment.
          </p>
        </div>

        <p className="mt-4 text-center text-[11px] text-[hsl(var(--app-faint))]">
          Powered by Dunda
        </p>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            const ATTEMPT_ID = ${JSON.stringify(attempt.id)};
            const btn = document.getElementById('pay-now');
            if (btn) {
              btn.addEventListener('click', async function() {
                btn.disabled = true;
                btn.textContent = 'Starting...';
                try {
                  const res = await fetch('/api/public/pay/' + ATTEMPT_ID + '/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Could not start the payment');
                  window.location.href = data.redirectUrl;
                } catch (err) {
                  alert(err.message);
                  btn.disabled = false;
                  btn.textContent = 'Pay with M-Pesa';
                }
              });
            }
          `,
        }}
      />
    </main>
  );
}
