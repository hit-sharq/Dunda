import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useGetAdminOrganizations, useGetAdminSummary } from "@workspace/api-client-react";
import { Card, Metric, State, linkButton } from "./shell";
import { colors, money, timeAgo } from "../lib/theme";

/**
 * The book of clients.
 *
 * The question this screen answers is not "how much money came in" — it is
 * "is anything wrong with a client". A club that has not rung up an order in a
 * fortnight is a churn signal and a support opportunity at the same time, so
 * that column is the one worth scanning.
 */
export function Clients() {
  const summary = useGetAdminSummary();
  const orgs = useGetAdminOrganizations();
  const [, setLocation] = useLocation();
  const [onlyQuiet, setOnlyQuiet] = useState(false);
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    let list = orgs.data ?? [];
    if (onlyQuiet) {
      const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
      list = list.filter(
        (o) => !o.lastOrderAt || new Date(o.lastOrderAt).getTime() < cutoff,
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) => o.name.toLowerCase().includes(q) || o.slug.includes(q),
      );
    }
    return list;
  }, [orgs.data, onlyQuiet, search]);

  const quietCount = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return (orgs.data ?? []).filter(
      (o) => !o.lastOrderAt || new Date(o.lastOrderAt).getTime() < cutoff,
    ).length;
  }, [orgs.data]);

  const s = summary.data;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Clients</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          Every club running on Dunda, and whether it is actually being used.
        </p>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Metric label="Clients" value={s ? String(s.venues) : "—"} />
        <Metric label="Live branches" value={s ? String(s.liveBranches) : "—"} />
        <Metric label="Active staff" value={s ? String(s.staff) : "—"} />
        <Metric
          label={`Revenue, ${s?.windowDays ?? 30}d`}
          value={s ? money(s.revenueInWindow) : "—"}
        />
        <Metric
          label="Quiet clients"
          value={String(quietCount)}
          note="no order in 14 days"
        />
      </div>

      <Card style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients"
          style={{
            minHeight: 38,
            flex: "1 1 220px",
            borderRadius: 10,
            border: `1px solid ${colors.line}`,
            background: "#fffefb",
            padding: "0 12px",
            fontSize: 13,
          }}
        />
        <button
          onClick={() => setOnlyQuiet((v) => !v)}
          style={{
            ...linkButton,
            marginTop: 0,
            background: onlyQuiet ? colors.amberSoft : colors.surface,
            borderColor: onlyQuiet ? colors.amber : colors.line,
          }}
        >
          {onlyQuiet ? "Showing quiet only" : "Show quiet only"}
        </button>
      </Card>

      <State
        loading={orgs.isLoading}
        error={orgs.error}
        empty={!orgs.isLoading && rows.length === 0}
        emptyTitle={
          onlyQuiet || search
            ? "Nothing matches that filter."
            : "No clients yet."
        }
        emptyHint={
          onlyQuiet
            ? "Every client has rung up an order in the last fortnight."
            : "Provision your first club to get started."
        }
        onRetry={() => orgs.refetch()}
      >
        {rows.length > 0 && (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: colors.canvas }}>
                  {["Client", "Branches", "Staff", "Tables", "Orders 30d", "Revenue 30d", "Last order"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "10px 14px",
                          fontSize: 10,
                          letterSpacing: 1,
                          textTransform: "uppercase",
                          color: colors.mutedSoft,
                          fontWeight: 700,
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
                  const quiet =
                    !o.lastOrderAt || new Date(o.lastOrderAt).getTime() < cutoff;
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setLocation(`/clients/${o.id}`)}
                      style={{
                        borderTop: `1px solid ${colors.line}`,
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: "12px 14px" }}>
                        <p style={{ margin: 0, fontWeight: 700 }}>{o.name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: colors.mutedSoft }}>
                          {[o.slug, o.currency, o.taxRate !== undefined ? `${o.taxRate}% tax` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </td>
                      <td style={{ padding: "12px 14px", fontVariantNumeric: "tabular-nums" }}>
                        {o.branches}
                        {o.liveBranches < o.branches ? (
                          <span style={{ color: colors.amber, marginLeft: 4 }}>({o.liveBranches} live)</span>
                        ) : null}
                      </td>
                      <td style={{ padding: "12px 14px", fontVariantNumeric: "tabular-nums" }}>
                        {o.activeStaff}/{o.staff}
                      </td>
                      <td style={{ padding: "12px 14px", fontVariantNumeric: "tabular-nums" }}>
                        {o.tables}
                      </td>
                      <td style={{ padding: "12px 14px", fontVariantNumeric: "tabular-nums" }}>
                        {o.ordersInWindow}
                      </td>
                      <td style={{ padding: "12px 14px", fontVariantNumeric: "tabular-nums" }}>
                        {money(o.revenueInWindow)}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            background: quiet ? colors.amberSoft : colors.greenSoft,
                            color: quiet ? colors.amber : colors.green,
                            borderRadius: 999,
                            padding: "3px 9px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {timeAgo(o.lastOrderAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </State>
    </div>
  );
}
