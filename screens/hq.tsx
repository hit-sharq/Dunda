import {
  useGetBranches,
  useGetEventReport,
  useGetHqReport,
  useGetInventoryReport,
  useGetPaymentReport,
  useGetSalesReport,
  useGetStaffReport,
  useGetTableReport,
} from "@/lib/api-client-react/src";
import {
  Button,
  Metric,
  PageIntro,
  money,
} from "../components/ui";
import { QueryNotice } from "../components/query-notice";

// Same window as the other report screens, so the two never disagree.
const DEFAULT_REPORT_DAYS = 30;
const today = new Date();
const from = new Date(today.getTime() - DEFAULT_REPORT_DAYS * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const to = today.toISOString().slice(0, 10);

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--app-line-soft))]">
      <div
        className="h-full rounded-full bg-[hsl(var(--app-success))]"
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  );
}

export function Hq() {
  const hq = useGetHqReport();
  const branches = useGetBranches();
  const sales = useGetSalesReport({ dateFrom: from, dateTo: to });
  const inventory = useGetInventoryReport();
  const staff = useGetStaffReport();
  const tables = useGetTableReport();
  const payments = useGetPaymentReport();
  const events = useGetEventReport();

  const branchesData = hq.data?.branches ?? [];
  const maxBranchRevenue = Math.max(...branchesData.map((b) => b.revenue), 1);

  return (
    <div className="rise">
      <PageIntro
        eyebrow="Organization HQ / multi-branch"
        title="The whole group"
        detail="Consolidated performance across every branch. Figures are presented side by side rather than ranked, so each site can be read on its own terms."
        action={
          <Button variant="outline" onClick={() => { hq.refetch(); sales.refetch(); }}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Total revenue"
          value={hq.data ? money(hq.data.totalRevenue) : "—"}
          note="All completed orders, all branches"
          tone="coral"
        />
        <Metric
          label="Total orders"
          value={hq.data ? String(hq.data.totalOrders) : "—"}
          note={`${hq.data?.activeBranches ?? 0} active branches`}
        />
        <Metric
          label="Inventory alerts"
          value={hq.data ? String(hq.data.inventoryAlerts) : "—"}
          note={`${inventory.data?.outOfStock ?? 0} out of stock`}
        />
        <Metric
          label="Upcoming events"
          value={hq.data ? String(hq.data.upcomingEvents) : "—"}
          note={`${hq.data?.activeStaff ?? 0} staff on the roster`}
        />
      </div>

      <section className="surface mt-5 rounded-2xl p-5">
        <h3 className="mb-4 font-display text-xl font-bold">Branch comparison</h3>
        <QueryNotice
          loading={hq.isLoading}
          error={hq.error}
          empty={!hq.isLoading && !hq.isError && !branchesData.length}
          onRetry={() => hq.refetch()}
          emptyTitle="No branches yet"
          emptyHint="Add a branch to see consolidated reporting."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {branchesData.map((b) => (
            <article
              key={b.id}
              className="rounded-xl border border-[hsl(var(--app-line-soft))] bg-[hsl(var(--app-surface))] p-4"
              data-testid={`card-hq-branch-${b.id}`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="font-display text-lg font-bold">{b.name}</p>
                  <p className="text-xs text-[hsl(var(--app-muted))]">{b.city}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    b.status === "LIVE"
                      ? "bg-[hsl(var(--app-success-soft))] text-[hsl(var(--app-success))]"
                      : "bg-[hsl(var(--app-line))] text-[hsl(var(--app-muted))]"
                  }`}
                >
                  {b.status}
                </span>
              </div>
              <div className="mb-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="font-mono text-lg font-semibold">
                    {money(b.revenue)}
                  </span>
                  <span className="font-mono text-[10px] text-[hsl(var(--app-muted))]">
                    {b.orders} orders
                  </span>
                </div>
                <Bar value={b.revenue} max={maxBranchRevenue} />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-[hsl(var(--app-muted))]">Tables</dt>
                  <dd className="font-mono">{b.tables}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[hsl(var(--app-muted))]">Alerts</dt>
                  <dd className="font-mono">{b.inventoryAlerts}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="surface rounded-2xl p-5">
          <h3 className="mb-4 font-display text-xl font-bold">Payment mix</h3>
          <QueryNotice
            loading={payments.isLoading}
            error={payments.error}
            empty={!payments.isLoading && !payments.isError && !payments.data?.byMethod.length}
            onRetry={() => payments.refetch()}
            emptyTitle="No payments recorded"
            emptyHint="Completed sales will build this breakdown."
          />
          <div className="grid gap-2.5">
            {payments.data?.byMethod.map((m) => (
              <div key={m.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-semibold">{m.label}</span>
                  <span className="font-mono text-[hsl(var(--app-ink-soft))]">
                    {money(m.value)} · {m.count}
                  </span>
                </div>
                <Bar value={m.value} max={Math.max(...(payments.data?.byMethod.map((x) => x.value) ?? [1]))} />
              </div>
            ))}
          </div>
          {payments.data && payments.data.refunded > 0 && (
            <p className="mt-4 border-t border-[hsl(var(--app-line-soft))] pt-3 text-xs text-[hsl(var(--app-critical))]">
              Refunds in range: {money(payments.data.refunded)}
            </p>
          )}
        </section>

        <section className="surface rounded-2xl p-5">
          <h3 className="mb-4 font-display text-xl font-bold">Stock performance</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="font-display text-2xl font-bold">
                {inventory.data?.totalItems ?? "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--app-muted))]">
                Items
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold">
                {inventory.data?.belowReorder ?? "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--app-muted))]">
                Below reorder
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold">
                {money(inventory.data?.stockValue ?? 0)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--app-muted))]">
                Stock value
              </p>
            </div>
          </div>
          <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--app-faint))]">
            Inventory discrepancies
          </h4>
          <QueryNotice
            loading={inventory.isLoading}
            error={inventory.error}
            empty={
              !inventory.isLoading &&
              !inventory.isError &&
              !inventory.data?.discrepancies.length
            }
            emptyTitle="No discrepancies"
            emptyHint="Approved stock counts with a variance will be listed here."
          />
          <ul className="grid gap-1.5 text-xs">
            {inventory.data?.discrepancies.map((d: (typeof inventory.data.discrepancies)[number]) => (
              <li
                key={d.productId}
                className="flex items-center justify-between border-b border-[hsl(var(--app-raised))] pb-1.5 last:border-0"
              >
                <span>{d.name ?? d.productId}</span>
                <span
                  className={`font-mono ${(d.variance ?? 0) < 0 ? "text-[hsl(var(--app-critical))]" : "text-[hsl(var(--app-success))]"}`}
                >
                  {(d.variance ?? 0) > 0 ? "+" : ""}
                  {d.variance ?? 0} {d.unit}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="surface rounded-2xl p-5">
          <h3 className="mb-4 font-display text-xl font-bold">Staff sales</h3>
          <QueryNotice
            loading={staff.isLoading}
            error={staff.error}
            empty={!staff.isLoading && !staff.isError && !staff.data?.length}
            onRetry={() => staff.refetch()}
            emptyTitle="No completed orders in range"
            emptyHint="Sales attributed to staff will appear here."
          />
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[hsl(var(--app-line-soft))] text-left text-[10px] uppercase tracking-wider text-[hsl(var(--app-faint))]">
                <th className="py-2 font-semibold">Staff</th>
                <th className="py-2 text-right font-semibold">Orders</th>
                <th className="py-2 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {staff.data?.map((s) => (
                <tr key={s.staffId ?? s.name} className="border-b border-[hsl(var(--app-raised))] last:border-0">
                  <td className="py-2">{s.name}</td>
                  <td className="py-2 text-right font-mono">{s.orders}</td>
                  <td className="py-2 text-right font-mono">{money(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="surface rounded-2xl p-5">
          <h3 className="mb-4 font-display text-xl font-bold">Events</h3>
          <QueryNotice
            loading={events.isLoading}
            error={events.error}
            empty={!events.isLoading && !events.isError && !events.data?.length}
            onRetry={() => events.refetch()}
            emptyTitle="No events scheduled"
            emptyHint="Create an event to track reservations and guests."
          />
          <ul className="grid gap-2.5">
            {events.data?.map((e) => (
              <li key={e.id} className="border-b border-[hsl(var(--app-raised))] pb-2 last:border-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{e.name}</span>
                  <span className="font-mono text-[10px] text-[hsl(var(--app-muted))]">{e.date}</span>
                </div>
                <p className="text-xs text-[hsl(var(--app-ink-soft))]">
                  {e.reservations} reservations · {e.guests} guests ·{" "}
                  {e.utilisation}% of capacity
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {tables.data && tables.data.length > 0 && (
        <section className="surface mt-5 rounded-2xl p-5">
          <h3 className="mb-4 font-display text-xl font-bold">Table utilisation</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tables.data
              .filter((t) => t.covers > 0)
              .sort((a, b) => b.revenue - a.revenue)
              .slice(0, 9)
              .map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg bg-[hsl(var(--app-bg))] px-3 py-2 text-xs"
                >
                  <span>
                    <span className="font-semibold">{t.name}</span>
                    <span className="ml-1 text-[hsl(var(--app-muted))]">{t.section}</span>
                  </span>
                  <span className="font-mono">
                    {t.covers} covers · {money(t.revenue)}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
