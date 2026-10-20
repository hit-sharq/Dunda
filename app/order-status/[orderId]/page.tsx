import { prisma } from "@/lib/db/client";
import { notFound as nextNotFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrderStatusPage({
  params,
}: {
  params: { orderId: string };
}) {
  const order = await prisma.dunda_orders.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      number: true,
      status: true,
      table_id: true,
      subtotal: true,
      service_charge: true,
      tax: true,
      discount: true,
      total: true,
      created_at: true,
      dunda_order_items: {
        select: { id: true, name: true, quantity: true, unit_price: true, total: true, notes: true },
      },
      dunda_order_tickets: { select: { id: true, station: true, status: true } },
      dunda_branches: { select: { name: true } },
      dunda_organizations: { select: { name: true, currency: true } },
    },
  });

  if (!order) return nextNotFound();

  const currency = order.dunda_organizations.currency;
  const money = (amount: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);

  const ready = order.dunda_order_tickets.some((t) => t.status === "READY");
  const served = order.dunda_order_tickets.some((t) => t.status === "SERVED");

  const stage = served
    ? "SERVED"
    : ready
      ? "READY"
      : order.status === "CANCELLED"
        ? "CANCELLED"
        : order.status === "COMPLETED"
          ? "COMPLETED"
          : "IN_PROGRESS";

  const STAGE_COPY: Record<string, { title: string; detail: string; tone: string }> = {
    IN_PROGRESS: {
      title: "Your order is with the kitchen",
      detail: "They are working on it now. This page updates on its own.",
      tone: "text-[hsl(var(--app-warn))] bg-[hsl(var(--app-warn-soft))]",
    },
    READY: {
      title: "Ready for you",
      detail: "Your order is done. A server is bringing it over.",
      tone: "text-[hsl(var(--app-green))] bg-[hsl(var(--app-green-soft))]",
    },
    SERVED: {
      title: "Served",
      detail: "Enjoy. Settle your bill at the counter.",
      tone: "text-[hsl(var(--app-green))] bg-[hsl(var(--app-green-soft))]",
    },
    COMPLETED: {
      title: "Order complete",
      detail: "Paid and closed. Thank you.",
      tone: "text-[hsl(var(--app-green))] bg-[hsl(var(--app-green-soft))]",
    },
    CANCELLED: {
      title: "Order cancelled",
      detail: "Speak to your server about this one.",
      tone: "text-[hsl(var(--app-critical))] bg-[hsl(var(--app-critical-soft))]",
    },
  };

  const copy = STAGE_COPY[stage] ?? STAGE_COPY.IN_PROGRESS;

  return (
    <main className="min-h-dvh bg-[hsl(var(--app-bg))] px-4 py-6">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <p className="text-[10px] font-mono uppercase tracking-[.2em] text-[hsl(var(--app-faint))]">
            {order.dunda_organizations.name} · {order.dunda_branches.name}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[hsl(var(--app-ink))]">
            Order {order.number}
          </h1>
        </div>

        <div
          className={`mb-5 rounded-2xl px-5 py-4 text-center ${copy.tone}`}
          id="stage"
          data-stage={stage}
        >
          <p className="text-lg font-bold">{copy.title}</p>
          <p className="mt-1 text-sm opacity-80">{copy.detail}</p>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-4">
          <h2 className="mb-3 text-sm font-bold text-[hsl(var(--app-ink))]">Your items</h2>
          <ul className="space-y-2">
            {order.dunda_order_items.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-[hsl(var(--app-ink))]">
                  <span className="text-[hsl(var(--app-faint))]">{i.quantity}×</span>{" "}
                  {i.name}
                  {i.notes ? (
                    <span className="block text-[11px] italic text-[hsl(var(--app-faint))]">
                      {i.notes}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold text-[hsl(var(--app-ink))]">
                  {money(i.total)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-1 border-t border-[hsl(var(--app-line))] pt-3 text-sm">
            <div className="flex justify-between text-[hsl(var(--app-faint))]">
              <span>Subtotal</span>
              <span>{money(order.subtotal)}</span>
            </div>
            {order.service_charge > 0 ? (
              <div className="flex justify-between text-[hsl(var(--app-faint))]">
                <span>Service charge</span>
                <span>{money(order.service_charge)}</span>
              </div>
            ) : null}
            {order.tax > 0 ? (
              <div className="flex justify-between text-[hsl(var(--app-faint))]">
                <span>Tax</span>
                <span>{money(order.tax)}</span>
              </div>
            ) : null}
            {order.discount > 0 ? (
              <div className="flex justify-between text-[hsl(var(--app-faint))]">
                <span>Discount</span>
                <span>-{money(order.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between pt-1 text-base font-bold text-[hsl(var(--app-ink))]">
              <span>Total</span>
              <span>{money(order.total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 text-center">
          <a
            href={`/order/${order.table_id}`}
            className="text-xs text-[hsl(var(--app-faint))] underline"
            id="order-more"
          >
            Add more items
          </a>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            const ORDER_ID = ${JSON.stringify(order.id)};
            async function refresh() {
              try {
                const res = await fetch('/api/public/order/' + ORDER_ID);
                if (!res.ok) return;
                const data = await res.json();
                const stageEl = document.getElementById('stage');
                if (stageEl && stageEl.getAttribute('data-stage') !== data.stage) {
                  location.reload();
                }
              } catch (e) {}
            }
            setInterval(refresh, 10000);
          `,
        }}
      />
    </main>
  );
}
