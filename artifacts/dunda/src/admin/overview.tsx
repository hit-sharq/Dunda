import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  useGetAdminBilling,
  useGetAdminOrganizations,
  useGetAdminSubscriptions,
  useGetAdminSummary,
} from "@workspace/api-client-react";
import { Card, Metric, State, linkButton } from "./ui";
import { colors, money, timeAgo } from "./theme";

/**
 * The platform owner's morning screen.
 *
 * The number worth reading is not the revenue figure but the exceptions: clubs
 * past due, renewals due this month, and clubs that have gone quiet. A club with
 * no order in a fortnight is a churn signal, and it is the one thing here that
 * asks you to do something.
 */
export function Overview() {
  const summary = useGetAdminSummary();
  const orgs = useGetAdminOrganizations();
  const subs = useGetAdminSubscriptions();
  const [, setLocation] = useLocation();

  const s = summary.data;

  const quiet = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return (orgs.data ?? []).filter(
      (o) => !o.lastOrderAt || new Date(o.lastOrderAt).getTime() < cutoff,
    );
  }, [orgs.data]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Overview</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          How the business is doing, and what needs you.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        }}
      >
        <Metric
          label="MRR"
          value={s ? money(s.mrr) : "—"}
          note="what clubs are committed to monthly"
        />
        <Metric
          label="Collected"
          value={s ? money(s.collected) : "—"}
          note="money actually received"
        />
        <Metric label="Clubs" value={s ? String(s.clubs) : "—"} note={`${s?.newClubsThisMonth ?? 0} new this month`} />
        <Metric label="Active" value={s ? String(s.activeClubs) : "—"} note={`${s?.trialClubs ?? 0} on trial`} />
        <Metric
          label="Past due"
          value={s ? String(s.pastDueClubs) : "—"}
          note="need chasing"
        />
        <Metric
          label="Churned, 30d"
          value={s ? String(s.churnedLast30Days) : "—"}
          note="cancelled or expired"
        />
        <Metric label="Active staff" value={s ? String(s.activeStaff) : "—"} />
        <Metric
          label="Club sales"
          value={s ? money(s.clubRevenueInWindow) : "—"}
          note={`last ${s?.windowDays ?? 30} days, theirs not ours`}
        />
      </div>

      <State
        loading={summary.isLoading || orgs.isLoading}
        error={summary.error ?? orgs.error}
        empty={false}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <Card style={{ borderColor: quiet.length ? colors.amberSoft : colors.line }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                  Needs a look
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.muted }}>
                  {quiet.length
                    ? `${quiet.length} club${quiet.length === 1 ? " has" : "s have"} not rung up an order in two weeks.`
                    : "Every club has traded in the last fortnight."}
                </p>
              </div>
            </div>
            {quiet.length > 0 && (
              <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                {quiet.slice(0, 8).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setLocation(`/admin/clients/${o.id}`)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      background: "none",
                      border: "none",
                      borderTop: `1px solid ${colors.line}`,
                      padding: "8px 0",
                      cursor: "pointer",
                      fontSize: 13,
                      textAlign: "left",
                      color: colors.ink,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{o.name}</span>
                    <span style={{ color: colors.mutedSoft }}>last order {timeAgo(o.lastOrderAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <Card>
              <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 800 }}>
                Renewals due
              </h2>
              {!subs.data ? (
                <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Loading…</p>
              ) : subs.data.renewalsDue.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
                  Nothing due in the next thirty days.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {subs.data.renewalsDue.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        borderTop: `1px solid ${colors.line}`,
                        paddingTop: 6,
                      }}
                    >
                      <span>{r.organization}</span>
                      <span style={{ fontWeight: 600 }}>
                        {r.renewsAt ? new Date(r.renewsAt).toISOString().slice(0, 10) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 800 }}>
                Failed payments
              </h2>
              {!subs.data ? (
                <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Loading…</p>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: subs.data.counts.pastDue > 0 ? colors.amber : colors.ink }}>
                    {subs.data.counts.pastDue}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.muted }}>
                    club{subs.data.counts.pastDue === 1 ? "" : "s"} past due or failed
                  </p>
                  <button
                    style={{ ...linkButton, marginTop: 10 }}
                    onClick={() => setLocation("/admin/billing")}
                  >
                    See billing history
                  </button>
                </>
              )}
            </Card>
          </div>
        </div>
      </State>
    </div>
  );
}
