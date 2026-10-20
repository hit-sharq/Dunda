import { prisma } from "@/lib/db/client";
import { resolveSession } from "@/lib/server/http";
import { notFound as nextNotFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { branchId?: string; days?: string };
}) {
  const session = await resolveSession();
  if (!session) return nextNotFound();
  if (!session.organizationId) return nextNotFound();

  const branches = await prisma.dunda_branches.findMany({
    where: { organization_id: session.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const activeBranchId = searchParams.branchId ?? session.branchId ?? branches[0]?.id ?? null;
  const days = Math.min(365, Math.max(1, Number(searchParams.days ?? 30)));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const scope = {
    organization_id: session.organizationId,
    ...(activeBranchId ? { branch_id: activeBranchId } : {}),
  };

  const [totalAgg, byMethod, orderCount, voidedAgg, topItems, byStaff, byCategory, rawPayments] =
    await Promise.all([
      prisma.dunda_payments.aggregate({
        where: { ...scope, status: { not: "VOIDED" }, paid_at: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.dunda_payments.groupBy({
        by: ["method"],
        where: { ...scope, status: { not: "VOIDED" }, paid_at: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.dunda_orders.count({ where: { ...scope, created_at: { gte: since } } }),
      prisma.dunda_payments.aggregate({
        where: { ...scope, status: "VOIDED", paid_at: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.dunda_order_items.groupBy({
        by: ["name"],
        where: { dunda_orders: { ...scope, created_at: { gte: since } } },
        _sum: { quantity: true, total: true },
        _count: true,
        orderBy: { _sum: { total: "desc" } },
        take: 12,
      }),
      prisma.dunda_payments.groupBy({
        by: ["cashier_id"],
        where: { ...scope, status: { not: "VOIDED" }, paid_at: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.dunda_order_items.groupBy({
        by: ["category_id"],
        where: { dunda_orders: { ...scope, created_at: { gte: since } } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.dunda_payments.findMany({
        where: { ...scope, status: { not: "VOIDED" }, paid_at: { gte: since } },
        select: { amount: true, paid_at: true },
      }),
    ]);

  const currency = (
    await prisma.dunda_organizations.findUnique({
      where: { id: session.organizationId },
      select: { currency: true },
    })
  )?.currency ?? "KES";

  const money = (amount: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);

  // Daily buckets
  const dailyMap = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const p of rawPayments) {
    const key = p.paid_at.toISOString().slice(0, 10);
    if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) ?? 0) + p.amount);
  }
  const daily = [...dailyMap.entries()].map(([date, total]) => ({ date, total }));
  const maxDaily = Math.max(1, ...daily.map((d) => d.total));

  const revenue = totalAgg._sum.amount ?? 0;
  const transactions = totalAgg._count;

  const staffIds = byStaff.map((s) => s.cashier_id).filter((id): id is string => Boolean(id));
  const staffRows = staffIds.length
    ? await prisma.dunda_staff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true },
      })
    : [];
  const staffName = new Map(staffRows.map((s) => [s.id, s.name]));

  const categoryIds = byCategory.map((c) => c.category_id).filter((id): id is string => Boolean(id));
  const categoryRows = categoryIds.length
    ? await prisma.dunda_categories.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
    : [];
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));

  const maxTop = Math.max(1, ...topItems.map((i) => (i._sum?.total ?? 0)));
  const maxStaff = Math.max(1, ...byStaff.map((s) => (s._sum?.amount ?? 0)));

  return (
    <main className="p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[.2em] text-[hsl(var(--app-faint))]">
              Reports
            </p>
            <h1 className="text-3xl font-extrabold tracking-[-.04em] text-[hsl(var(--app-ink))]">
              Sales performance
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--app-ink-soft))]">
              Last {days} days
              {activeBranchId
                ? ` · ${branches.find((b) => b.id === activeBranchId)?.name ?? ""}`
                : " · all branches"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form method="get" className="flex gap-2">
              {activeBranchId ? (
                <input type="hidden" name="branchId" value={activeBranchId} />
              ) : null}
              {[7, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  name="days"
                  value={d}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    days === d
                      ? "border-[hsl(var(--app-gold))] bg-[hsl(var(--app-gold))] text-[hsl(var(--app-ink))]"
                      : "border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-faint))]"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </form>
          </div>
        </div>

        {branches.length > 1 ? (
          <div className="mb-6 flex flex-wrap gap-2">
            {branches.map((b) => (
              <a
                key={b.id}
                href={`/reports?branchId=${b.id}&days=${days}`}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  activeBranchId === b.id
                    ? "border-[hsl(var(--app-gold))] bg-[hsl(var(--app-gold))] text-[hsl(var(--app-ink))]"
                    : "border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-faint))]"
                }`}
              >
                {b.name}
              </a>
            ))}
          </div>
        ) : null}

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Revenue", value: money(revenue) },
            { label: "Transactions", value: String(transactions) },
            {
              label: "Average ticket",
              value: money(transactions > 0 ? Math.round(revenue / transactions) : 0),
            },
            { label: "Orders", value: String(orderCount) },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-4"
            >
              <p className="text-[10px] font-mono uppercase tracking-[.15em] text-[hsl(var(--app-faint))]">
                {m.label}
              </p>
              <p className="mt-1.5 text-2xl font-extrabold text-[hsl(var(--app-ink))]">
                {m.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mb-6 rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-4">
          <h2 className="mb-4 text-sm font-bold text-[hsl(var(--app-ink))]">
            Daily revenue
          </h2>
          <div className="flex h-40 items-end gap-[2px]">
            {daily.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${money(d.total)}`}
                className="flex-1 rounded-t bg-[hsl(var(--app-gold))] transition-opacity hover:opacity-80"
                style={{ height: `${Math.max(2, (d.total / maxDaily) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-[hsl(var(--app-faint))]">
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-4">
            <h2 className="mb-3 text-sm font-bold text-[hsl(var(--app-ink))]">
              Top selling items
            </h2>
            {topItems.length === 0 ? (
              <p className="text-sm text-[hsl(var(--app-faint))]">Nothing sold yet.</p>
            ) : (
              <ul className="space-y-2">
                {topItems.map((i) => (
                  <li key={i.name} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-xs text-[hsl(var(--app-ink))]">
                      {i.name}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[hsl(var(--app-warn-soft))]">
                      <div
                        className="h-full rounded-full bg-[hsl(var(--app-gold))]"
                        style={{ width: `${(((i._sum?.total ?? 0)) / maxTop) * 100}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs font-semibold text-[hsl(var(--app-ink))]">
                      {money((i._sum?.total ?? 0))}
                    </span>
                    <span className="w-10 shrink-0 text-right text-[10px] text-[hsl(var(--app-faint))]">
                      {(i._sum?.quantity ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-4">
            <h2 className="mb-3 text-sm font-bold text-[hsl(var(--app-ink))]">
              Staff takings
            </h2>
            {byStaff.length === 0 ? (
              <p className="text-sm text-[hsl(var(--app-faint))]">No payments yet.</p>
            ) : (
              <ul className="space-y-2">
                {byStaff
                  .sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))
                  .map((s) => (
                    <li key={s.cashier_id ?? "walkin"} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-xs text-[hsl(var(--app-ink))]">
                        {s.cashier_id ? staffName.get(s.cashier_id) ?? "Unknown" : "Walk-in"}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[hsl(var(--app-warn-soft))]">
                        <div
                          className="h-full rounded-full bg-[hsl(var(--app-gold))]"
                          style={{ width: `${(((s._sum?.amount ?? 0)) / maxStaff) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs font-semibold text-[hsl(var(--app-ink))]">
                        {money((s._sum?.amount ?? 0))}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-4">
            <h2 className="mb-3 text-sm font-bold text-[hsl(var(--app-ink))]">
              Payment methods
            </h2>
            {byMethod.length === 0 ? (
              <p className="text-sm text-[hsl(var(--app-faint))]">No payments yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {byMethod
                  .sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))
                  .map((m) => (
                    <li
                      key={m.method}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-[hsl(var(--app-ink))]">{m.method}</span>
                      <span className="text-[hsl(var(--app-faint))]">{m._count} txns</span>
                      <span className="w-24 text-right font-semibold text-[hsl(var(--app-ink))]">
                        {money((m._sum?.amount ?? 0))}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-4">
            <h2 className="mb-3 text-sm font-bold text-[hsl(var(--app-ink))]">
              Revenue by category
            </h2>
            {byCategory.length === 0 ? (
              <p className="text-sm text-[hsl(var(--app-faint))]">Nothing sold yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {byCategory
                  .sort((a, b) => (b._sum.total ?? 0) - (a._sum.total ?? 0))
                  .map((c) => (
                    <li
                      key={c.category_id ?? "none"}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-[hsl(var(--app-ink))]">
                        {c.category_id
                          ? categoryName.get(c.category_id) ?? "Other"
                          : "Uncategorised"}
                      </span>
                      <span className="text-[hsl(var(--app-faint))]">{c._count} items</span>
                      <span className="w-24 text-right font-semibold text-[hsl(var(--app-ink))]">
                        {money((c._sum?.total ?? 0))}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            {voidedAgg._count > 0 ? (
              <p className="mt-3 border-t border-[hsl(var(--app-line))] pt-3 text-xs text-[hsl(var(--app-critical))]">
                {voidedAgg._count} voided payment(s) worth {money(voidedAgg._sum.amount ?? 0)} in
                this window.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
