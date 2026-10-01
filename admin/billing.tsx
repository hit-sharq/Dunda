import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useGetAdminBilling, useGetAdminSubscriptions } from "@/lib/api-client-react/src";
import { Card, State, inputStyle } from "./ui";
import { colors, money } from "./theme";

/**
 * Subscriptions and the money behind them.
 *
 * Two questions, kept on one screen because they are asked together: who is
 * paying, and who is not.
 */
export function Billing() {
  const subs = useGetAdminSubscriptions();
  const billing = useGetAdminBilling();
  const [filter, setFilter] = useState<string>("ALL");
  const [, setLocation] = useLocation();

  const counts = subs.data?.counts;

  const visible = useMemo(() => {
    const list = subs.data?.subscriptions ?? [];
    if (filter === "ALL") return list;
    return list.filter((s) => s.status === filter);
  }, [subs.data, filter]);

  const statusColour = (status: string) =>
    status === "ACTIVE"
      ? colors.green
      : status === "TRIAL"
        ? colors.muted
        : status === "SUSPENDED" || status === "CANCELLED" || status === "EXPIRED"
          ? colors.red
          : colors.amber;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Billing</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          Who is paying, who is not, and what failed.
        </p>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <Card>
          <p style={labelStyle}>Collected</p>
          <p style={valueStyle}>{billing.data ? money(billing.data.collected) : "—"}</p>
        </Card>
        <Card>
          <p style={labelStyle}>Active</p>
          <p style={valueStyle}>{counts?.active ?? "—"}</p>
        </Card>
        <Card>
          <p style={labelStyle}>On trial</p>
          <p style={valueStyle}>{counts?.trial ?? "—"}</p>
        </Card>
        <Card>
          <p style={labelStyle}>Past due</p>
          <p style={{ ...valueStyle, color: counts?.pastDue ? colors.amber : undefined }}>
            {counts?.pastDue ?? "—"}
          </p>
        </Card>
        <Card>
          <p style={labelStyle}>Cancelled</p>
          <p style={valueStyle}>{counts?.cancelled ?? "—"}</p>
        </Card>
        <Card>
          <p style={labelStyle}>Expired</p>
          <p style={valueStyle}>{counts?.expired ?? "—"}</p>
        </Card>
      </div>

      <Card style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Subscriptions</h2>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", minWidth: 160 }}
          >
            {["ALL", "ACTIVE", "TRIAL", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"].map((f) => (
              <option key={f} value={f}>
                {f === "ALL" ? "All statuses" : f.replace("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <State
          loading={subs.isLoading}
          error={subs.error}
          empty={!subs.isLoading && visible.length === 0}
          emptyTitle="No subscriptions here."
          emptyHint="Nothing matches that filter."
          onRetry={() => subs.refetch()}
        >
          {visible.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: colors.canvas }}>
                    {["Club", "Plan", "Status", "Cycle", "Amount", "Renews", ""].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.id} style={{ borderTop: `1px solid ${colors.line}` }}>
                      <td style={tdStyle}>
                        <button
                          onClick={() => setLocation(`/admin/clients/${s.organizationId}`)}
                          style={{ background: "none", border: "none", padding: 0, fontWeight: 600, color: colors.ink, cursor: "pointer" }}
                        >
                          {s.organization ?? "—"}
                        </button>
                      </td>
                      <td style={tdStyle}>{s.plan}</td>
                      <td style={tdStyle}>
                        <span style={{ color: statusColour(s.status), fontWeight: 700 }}>
                          {s.status.replace("_", " ").toLowerCase()}
                        </span>
                      </td>
                      <td style={tdStyle}>{s.billingCycle.toLowerCase()}</td>
                      <td style={tdStyle}>{money(s.amount)}</td>
                      <td style={tdStyle}>
                        {s.renewsAt ? new Date(s.renewsAt).toISOString().slice(0, 10) : "—"}
                        {s.renewalDue && (
                          <span style={{ color: colors.amber, marginLeft: 6 }}>due</span>
                        )}
                      </td>
                      <td style={tdStyle} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </State>
      </Card>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Card>
          <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 800 }}>
            Failed payments
          </h2>
          <State
            loading={billing.isLoading}
            error={billing.error}
            empty={!billing.isLoading && (billing.data?.failed.length ?? 0) === 0}
            emptyTitle="No failed payments."
            emptyHint="Every attempt has gone through."
          >
            <div style={{ display: "grid", gap: 6 }}>
              {(billing.data?.failed ?? []).map((f) => (
                <div key={f.id} style={{ borderTop: `1px solid ${colors.line}`, paddingTop: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                    <span>{f.organization ?? "—"}</span>
                    <span>{money(f.amount)}</span>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: colors.red }}>
                    {f.reason ?? "No reason recorded"}
                  </p>
                </div>
              ))}
            </div>
          </State>
        </Card>

        <Card>
          <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 800 }}>
            Invoices
          </h2>
          <State
            loading={billing.isLoading}
            error={billing.error}
            empty={!billing.isLoading && (billing.data?.invoices.length ?? 0) === 0}
            emptyTitle="No invoices yet."
            emptyHint="One is issued when a club's payment is confirmed."
          >
            <div style={{ display: "grid", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {(billing.data?.invoices ?? []).map((i) => (
                <div
                  key={i.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    borderTop: `1px solid ${colors.line}`,
                    paddingTop: 6,
                  }}
                >
                  <span>
                    <span style={{ fontWeight: 600 }}>{i.number}</span>
                    <span style={{ color: colors.mutedSoft, marginLeft: 8 }}>{i.organization}</span>
                  </span>
                  <span>{money(i.total)}</span>
                </div>
              ))}
            </div>
          </State>
        </Card>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: colors.mutedSoft,
};
const valueStyle: React.CSSProperties = { margin: "6px 0 0", fontSize: 24, fontWeight: 800 };
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 10,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: colors.mutedSoft,
  fontWeight: 700,
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "10px 14px", whiteSpace: "nowrap" };
