import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOrdersQueryKey,
  useGetOrders,
  useUpdateOrderStatus,
} from "@workspace/api-client-react";
import { Button, PageIntro, timeAgo } from "../components/ui";
import { QueryNotice } from '../components/query-notice';

const lanes = [
  { key: "PENDING", label: "New", color: "bg-[#4b927d]" },
  { key: "ACCEPTED", label: "Accepted", color: "bg-[#6f9fb2]" },
  { key: "PREPARING", label: "Preparing", color: "bg-[#d9b46c]" },
  { key: "READY", label: "Ready", color: "bg-[#f07a4b]" },
  { key: "SERVED", label: "Served", color: "bg-[#8b938c]" },
] as const;

const nextStatus: Record<string, string | null> = {
  PENDING: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: "SERVED",
  SERVED: null,
};

export function ServiceBoard({ station }: { station: "bar" | "kitchen" }) {
  const orders = useGetOrders();
  const update = useUpdateOrderStatus();
  const qc = useQueryClient();

  // A station only shows work that has not been served yet.
  const live = useMemo(
    () =>
      (orders.data ?? []).filter(
        (o) => !["SERVED", "COMPLETED", "CANCELLED"].includes(o.status),
      ),
    [orders.data],
  );

  function advance(orderId: string, status: string) {
    update.mutate(
      { orderId, data: { status: status as never } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetOrdersQueryKey() }) },
    );
  }

  return (
    <div className="rise">
      <PageIntro
        eyebrow={`${station === "bar" ? "Bar" : "Kitchen"} display`}
        title={station === "bar" ? "The pass" : "The kitchen"}
        detail={
          station === "bar"
            ? "Every drink order in the room, oldest first. Advance a ticket as it moves down the line."
            : "Food orders only. Notes from the floor travel with the ticket."
        }
        action={
          <Button variant="outline" onClick={() => orders.refetch()}>
            Refresh
          </Button>
        }
      />

      <QueryNotice
        loading={orders.isLoading}
        error={orders.error}
        empty={!orders.isLoading && !orders.isError && !live.length}
        onRetry={() => orders.refetch()}
        emptyTitle="No open tickets"
        emptyHint="Orders appear here the moment the floor sends them."
      />

      <div className="mobile-scroll grid min-w-[900px] grid-cols-5 gap-3">
        {lanes.map((lane) => {
          const items = live.filter((o) => o.status === lane.key);
          return (
            <section
              key={lane.key}
              className="min-h-[420px] rounded-2xl bg-[#ebe6dc] p-3"
              data-testid={`lane-${lane.key}`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <i className={`h-2.5 w-2.5 rounded-full ${lane.color}`} />
                  {lane.label}
                </span>
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#f6f1e8] px-1.5 font-mono text-[10px] text-[#77827b]">
                  {items.length}
                </span>
              </div>
              <div className="grid gap-3">
                {items.map((order) => (
                  <article
                    key={order.id}
                    className="surface rounded-xl p-4"
                    data-testid={`card-board-${order.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium text-[#b65332]">
                        {order.number}
                      </span>
                      <span className="text-[10px] text-[#8b958e]">
                        {timeAgo(order.createdAt)}
                      </span>
                    </div>
                    <h3 className="mt-1 font-display text-lg font-bold">
                      {order.table ?? "—"}
                    </h3>
                    <ul className="mt-2 border-t border-[#eee8de] pt-2 text-xs leading-5 text-[#65716b]">
                      {order.items.map((item, i) => (
                        <li key={`${order.id}-${i}`} className="flex gap-2">
                          <span className="font-mono text-[#b65332]">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    {order.notes && (
                      <p className="mt-2 rounded-lg bg-[#fbf2d9] px-2 py-1 text-[11px] text-[#92702b]">
                        {order.notes}
                      </p>
                    )}
                    {nextStatus[order.status] && (
                      <Button
                        className="mt-3 w-full"
                        disabled={update.isPending}
                        onClick={() => advance(order.id, nextStatus[order.status]!)}
                        data-testid={`button-advance-${order.id}`}
                      >
                        Mark {nextStatus[order.status]!.toLowerCase()}
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
