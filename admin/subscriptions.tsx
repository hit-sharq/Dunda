import { useState } from "react";
import { useLocation } from "wouter";
import { useGetAdminSubscriptions } from "@/lib/api-client-react/src";
import { Card, field, inputStyle, linkButton, primaryButton, State, labelStyle, valueStyle, tableStyle, thStyle, tdStyle } from "./ui";
import { colors } from "./theme";

/**
 * Every subscription on the platform and where it stands.
 *
 * Separate from Billing on purpose. Billing answers "what has Dunda been paid";
 * this answers "what has each club committed to, and when does it come due". A
 * club three weeks from renewal is not a billing problem yet, and it is not
 * visible on a payment ledger until the day it is one.
 *
 * Renewals due are listed on their own because they are the only rows anyone
 * acts on from here: everything else is reference.
 */
export function Subscriptions() {
  const subs = useGetAdminSubscriptions();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState("");

  const rows = (subs.data?.subscriptions ?? []) as {
    id: string;
    organizationId: string;
    organization?: string | null;
    plan: string;
    status: string;
    billingCycle: string;
    amount: number;
    currency: string;
    renewsAt?: string | null;
    renewalDue: boolean;
    trialEndsAt?: string | null;
  }[];
  const counts = subs.data?.counts;
  const renewals = (subs.data?.renewalsDue ?? []) as typeof rows;

  const shown = status ? rows.filter((r) => r.status === status) : rows;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Subscriptions</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          What every club has committed to, and what is coming up for renewal.
        </p>
      </div>

      {counts && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <Card style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Total</span>
            <span style={{ ...valueStyle, fontSize: 24 }}>{counts.total}</span>
          </Card>
          <Card style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Active</span>
            <span style={{ ...valueStyle, fontSize: 24, color: colors.green }}>{counts.active}</span>
          </Card>
          <Card style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>On trial</span>
            <span style={{ ...valueStyle, fontSize: 24, color: colors.amber }}>{counts.trial}</span>
          </Card>
          <Card style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Past due</span>
            <span style={{ ...valueStyle, fontSize: 24, color: counts.pastDue > 0 ? colors.red : undefined }}>
              {counts.pastDue}
            </span>
          </Card>
          <Card style={{ display: "grid", gap: 4 }}>
            <span style={labelStyle}>Cancelled</span>
            <span style={{ ...valueStyle, fontSize: 24 }}>{counts.cancelled}</span>
          </Card>
        </div>
      )}

      <Card style={{ display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Renewals due</h2>
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
          Within the next thirty days. A club here has paid for a period that ends
          soon, and is the one worth calling before it lapses.
        </p>
        <State
          loading={subs.isLoading}
          error={subs.isError}
          emptyTitle="Nothing due in the next thirty days."
          emptyHint="A club appears here once its current period is within a month of ending."
          empty={!subs.isLoading && !subs.isError && renewals.length === 0}
          onRetry={() => void subs.refetch()}
        >
          {renewals.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                gap: 12, borderTop: `1px solid ${colors.lineSoft}`, paddingTop: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{r.organization}</p>
                <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>
                  {r.plan} · {r.billingCycle.toLowerCase()}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: "var(--app-font-mono)", fontSize: 13 }}>
                  {r.renewsAt ? new Date(r.renewsAt).toISOString().slice(0, 10) : "—"}
                </span>
                <button
                  style={linkButton}
                  onClick={() => setLocation(`/admin/clients/${r.organizationId}`)}
                >
                  Open club
                </button>
              </div>
            </div>
          ))}
        </State>
      </Card>

      <Card style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>All subscriptions</h2>
          <div style={{ width: 190 }}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={inputStyle}
              data-testid="select-subscription-status"
            >
              <option value="">Every status</option>
              {(["ACTIVE", "TRIAL", "PAST_DUE", "PAYMENT_PENDING", "PAYMENT_FAILED", "SUSPENDED", "CANCELLED", "EXPIRED"] as const).map(
                (s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ").toLowerCase()}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
        <State
          loading={subs.isLoading}
          error={subs.isError}
          emptyTitle={status ? `Nothing is ${status.replace(/_/g, " ").toLowerCase()}.` : "No subscriptions yet."}
          emptyHint={
            status
              ? "Clear the filter to see the rest."
              : "A club gets one when you set a plan on it."
          }
          empty={!subs.isLoading && !subs.isError && shown.length === 0}
          onRetry={() => void subs.refetch()}
        >
          <div style={tableStyle}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Club</th>
                  <th style={thStyle}>Plan</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Renews</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td style={tdStyle}>{r.organization ?? "Unknown"}</td>
                    <td style={tdStyle}>
                      {r.plan}
                      <span style={{ color: colors.mutedSoft, marginLeft: 6, fontSize: 12 }}>
                        {r.billingCycle.toLowerCase()}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={statusPill(r.status)}>{r.status.replace(/_/g, " ").toLowerCase()}</span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "var(--app-font-mono)" }}>
                      {r.amount} {r.currency}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "var(--app-font-mono)", color: r.renewalDue ? colors.amber : undefined }}>
                      {r.renewsAt ? new Date(r.renewsAt).toISOString().slice(0, 10) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button style={linkButton} onClick={() => setLocation(`/admin/clients/${r.organizationId}`)}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </State>
      </Card>

      <div>
        <button style={primaryButton} onClick={() => setLocation("/admin/billing")}>
          See payments and invoices
        </button>
      </div>
    </div>
  );
}

/** Status as a chip, so a column of them can be scanned rather than read. */
function statusPill(status: string): React.CSSProperties {
  const tone =
    status === "ACTIVE"
      ? colors.green
      : status === "TRIAL"
        ? colors.amber
        : status === "CANCELLED" || status === "EXPIRED"
          ? colors.muted
          : colors.red;
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    color: tone,
    background: colors.surface,
    border: `1px solid ${tone}`,
  };
}
