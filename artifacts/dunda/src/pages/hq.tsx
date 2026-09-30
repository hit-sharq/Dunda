import {
  useGetBranches,
  useGetEventReport,
  useGetHqReport,
  useGetInventoryReport,
  useGetPaymentReport,
  useGetSalesReport,
  useGetStaffReport,
  useGetTableReport,
} from "@workspace/api-client-react";
import {
  Button,
  Metric,
  PageIntro,
  QueryNotice,
  money,
} from "../components/ui";

const today = new Date();
const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const to = today.toISOString().slice(0, 10);

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e7e1d6]">
      <div
        className="h-full rounded-full bg-[#4b927d]"
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
          error={hq.isError}
          empty={!hq.isLoading && !hq.isError && !branchesData.length}
          onRetry={() => hq.refetch()}
          emptyTitle="No branches yet"
          emptyHint="Add a branch to see consolidated reporting."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {branchesData.map((b) => (
            <article
              key={b.id}
              className="rounded-xl border border-[#e8e1d6] bg-[#fbf9f3] p-4"
              data-testid={`card-hq-branch-${b.id}`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="font-display text-lg font-bold">{b.name}</p>
                  <p className="text-xs text-[#859089]">{b.city}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    b.status === "LIVE"
                      ? "bg-[#e2f0e8] text-[#3c7e69]"
                      : "bg-[#ece8de] text-[#7c8780]"
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
                  <span className="font-mono text-[10px] text-[#859089]">
                    {b.orders} orders
                  </span>
                </div>
                <Bar value={b.revenue} max={maxBranchRevenue} />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-[#859089]">Tables</dt>
                  <dd className="font-mono">{b.tables}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#859089]">Alerts</dt>
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
            error={payments.isError}
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
                  <span className="font-mono text-[#65716b]">
                    {money(m.value)} · {m.count}
                  </span>
                </div>
                <Bar value={m.value} max={Math.max(...(payments.data?.byMethod.map((x) => x.value) ?? [1]))} />
              </div>
            ))}
          </div>
          {payments.data && payments.data.refunded > 0 && (
            <p className="mt-4 border-t border-[#e8e1d6] pt-3 text-xs text-[#a3452e]">
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
              <p className="text-[10px] uppercase tracking-wider text-[#859089]">
                Items
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold">
                {inventory.data?.belowReorder ?? "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[#859089]">
                Below reorder
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold">
                {money(inventory.data?.stockValue ?? 0)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[#859089]">
                Stock value
              </p>
            </div>
          </div>
          <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-[#8b938c]">
            Inventory discrepancies
          </h4>
          <QueryNotice
            loading={inventory.isLoading}
            error={inventory.isError}
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
                className="flex items-center justify-between border-b border-[#f0ebe1] pb-1.5 last:border-0"
              >
                <span>{d.name ?? d.productId}</span>
                <span
                  className={`font-mono ${(d.variance ?? 0) < 0 ? "text-[#a3452e]" : "text-[#3e8a71]"}`}
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
            error={staff.isError}
            empty={!staff.isLoading && !staff.isError && !staff.data?.length}
            onRetry={() => staff.refetch()}
            emptyTitle="No completed orders in range"
            emptyHint="Sales attributed to staff will appear here."
          />
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#e8e1d6] text-left text-[10px] uppercase tracking-wider text-[#8b938c]">
                <th className="py-2 font-semibold">Staff</th>
                <th className="py-2 text-right font-semibold">Orders</th>
                <th className="py-2 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {staff.data?.map((s) => (
                <tr key={s.staffId ?? s.name} className="border-b border-[#f0ebe1] last:border-0">
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
            error={events.isError}
            empty={!events.isLoading && !events.isError && !events.data?.length}
            onRetry={() => events.refetch()}
            emptyTitle="No events scheduled"
            emptyHint="Create an event to track reservations and guests."
          />
          <ul className="grid gap-2.5">
            {events.data?.map((e) => (
              <li key={e.id} className="border-b border-[#f0ebe1] pb-2 last:border-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{e.name}</span>
                  <span className="font-mono text-[10px] text-[#859089]">{e.date}</span>
                </div>
                <p className="text-xs text-[#65716b]">
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
                  className="flex items-center justify-between rounded-lg bg-[#f5f1e8] px-3 py-2 text-xs"
                >
                  <span>
                    <span className="font-semibold">{t.name}</span>
                    <span className="ml-1 text-[#859089]">{t.section}</span>
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
