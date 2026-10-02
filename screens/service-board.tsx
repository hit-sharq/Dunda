import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetTickets, useUpdateTicket } from "@/lib/api-client-react/src";
import { Button, PageIntro, timeAgo } from "../components/ui";
import { QueryNotice } from "../components/query-notice";

/**
 * One board per preparation station.
 *
 * A table ordering both drinks and food gets a bar ticket and a kitchen ticket
 * under the same order. They share the bill but move independently, so this
 * board only ever shows the lines the bar is responsible for, and serving a
 * round does not clear the food from the pass.
 */
const LANES = [
  { key: "PENDING", label: "New", color: "bg-[#4b927d]" },
  { key: "ACCEPTED", label: "Accepted", color: "bg-[#6f9fb2]" },
  { key: "PREPARING", label: "Preparing", color: "bg-[#d9b46c]" },
  { key: "READY", label: "Ready", color: "bg-[#f07a4b]" },
  { key: "SERVED", label: "Served", color: "bg-[#8b938c]" },
] as const;

const NEXT_STATUS: Record<string, string | null> = {
  PENDING: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: "SERVED",
  SERVED: null,
};

export function ServiceBoard({ station }: { station: "bar" | "kitchen" }) {
  const stationCode = station.toUpperCase() as "BAR" | "KITCHEN";
  const queryClient = useQueryClient();

  const tickets = useGetTickets({ station: stationCode });
  const advance = useUpdateTicket();

  const rows = tickets.data ?? [];
  const isBar = stationCode === "BAR";

  return (
    <div className="rise">
      <PageIntro
        eyebrow={`${isBar ? "Bar" : "Kitchen"} display · ${stationCode}`}
        title={isBar ? "The rail" : "The pass"}
        detail={
          isBar
            ? "Only the drinks this station is responsible for. Drinks and food on the same table advance separately, so serving one does not close the other."
            : "Only the food this station is responsible for. Drinks and food on the same table advance separately, so serving one does not close the other."
        }
        action={
          <Button variant="outline" onClick={() => tickets.refetch()}>
            Refresh
          </Button>
        }
      />

      <QueryNotice
        loading={tickets.isLoading}
        error={tickets.error}
        what={isBar ? "bar tickets" : "kitchen tickets"}
        emptyTitle={`No ${isBar ? "bar" : "kitchen"} tickets`}
        emptyHint={`${isBar ? "Drinks" : "Food"} appear here as soon as the floor sends them.`}
        onRetry={() => tickets.refetch()}
      />

      {rows.length > 0 && (
        <div className="mobile-scroll grid min-w-[900px] grid-cols-5 gap-3">
          {LANES.map((lane) => {
            const items = rows.filter((t) => t.status === lane.key);
            return (
              <section
                key={lane.key}
                className="min-h-[420px] rounded-2xl bg-[#ebe6dc] p-3"
                data-testid={`lane-${stationCode}-${lane.key}`}
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
                  {items.map((ticket) => (
                    <article
                      key={ticket.id}
                      className="surface rounded-xl p-4"
                      data-testid={`card-ticket-${ticket.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-medium text-[#b65332]">
                          {ticket.table ?? "No table"}
                        </span>
                        <span className="font-mono text-[10px] text-[#8b958e]">
                          {timeAgo(ticket.createdAt)}
                        </span>
                      </div>
                      <h3 className="mt-1 font-display text-lg font-bold">
                        {ticket.number}
                      </h3>
                      <ul className="mt-2 border-t border-[#eee8de] pt-2 text-xs leading-5 text-[#65716b]">
                        {ticket.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex justify-between gap-2"
                          >
                            <span>
                              <span className="font-mono text-[#b65332]">
                                {item.quantity}×
                              </span>{" "}
                              {item.name}
                              {item.notes ? (
                                <span className="block text-[10px] italic text-[#92702b]">
                                  {item.notes}
                                </span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {NEXT_STATUS[ticket.status] && (
                        <Button
                          className="mt-3 w-full"
                          disabled={advance.isPending}
                          onClick={() =>
                            advance.mutate(
                              {
                                ticketId: ticket.id,
                                data: { status: NEXT_STATUS[ticket.status]! as never },
                              },
                              {
                                onSuccess: () =>
                                  queryClient.invalidateQueries({
                                    queryKey: ["getTickets"],
                                  }),
                              },
                            )
                          }
                          data-testid={`button-advance-${ticket.id}`}
                        >
                          {ticket.status === "READY"
                            ? "Handed over"
                            : `Mark ${NEXT_STATUS[ticket.status]!.toLowerCase()}`}
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
