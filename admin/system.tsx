import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, linkButton, State, labelStyle, thStyle, tdStyle, tableStyle } from "./ui";
import { colors, timeAgo } from "./theme";

interface Health {
  status: "ok" | "degraded";
  checkedAt: string;
  issues: string[];
  checks: {
    database: { status: string; latencyMs: number; error?: string };
    paymentProvider: {
      provider: string;
      configured: boolean;
      failedCallbacks: number;
      pendingCallbacks: number;
    };
    payments: {
      failed: number;
      pending: number;
      unresolvedAttempts: number;
      stuck: {
        id: string;
        organizationId: string;
        amount: number;
        currency: string;
        since: string;
      }[];
    };
    jobs: { backgroundFailures: number };
  };
}

/**
 * Whether the platform is working.
 *
 * Reports what it found rather than only whether it passed, because the person
 * reading this at three in the morning needs to know which part is down, not just
 * that something is. The database check is a real query and the payment provider is
 * only a configuration check — contacting the provider to see if it is up would
 * mean sending it something, which is not what a health screen is for.
 */
export function System() {
  const [, setLocation] = useLocation();
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/system", { credentials: "include" });
      const body = (await response.json()) as Health | { error: string };
      if (!response.ok && (body as { error?: string }).error) {
        throw (body as { error: string }).error;
      }
      setHealth(body as Health);
      setError(null);
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const degraded = health?.status === "degraded";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>System</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          Database, payments and callbacks. Refreshes every thirty seconds.
        </p>
      </div>

      <State
        loading={loading}
        error={error}
        emptyTitle="No reading yet."
        emptyHint="It should appear within a second or two."
        empty={!loading && !error && !health}
        onRetry={() => void load()}
      >
        {health && (
          <>
            <Card
              style={{
                display: "flex", alignItems: "center", gap: 14,
                borderColor: degraded ? colors.red : colors.green,
              }}
            >
              <span
                style={{
                  width: 10, height: 10, borderRadius: 999,
                  background: degraded ? colors.red : colors.green,
                }}
              />
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
                  {degraded ? "Degraded" : "Everything is up"}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>
                  Checked {timeAgo(health.checkedAt)}
                </p>
              </div>
            </Card>

            {health.issues.length > 0 && (
              <Card style={{ display: "grid", gap: 8, borderColor: colors.amber }}>
                <span style={labelStyle}>Needs a look</span>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  {health.issues.map((issue) => (
                    <li key={issue} style={{ fontSize: 13, color: colors.inkSoft }}>{issue}</li>
                  ))}
                </ul>
              </Card>
            )}

            <Card style={{ display: "grid", gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Checks</h2>
              <div style={tableStyle}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Component</th>
                      <th style={thStyle}>State</th>
                      <th style={thStyle}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdStyle}>Database</td>
                      <td style={tdStyle}>
                        <HealthDot ok={health.checks.database.status === "up"} />
                        {health.checks.database.status}
                      </td>
                      <td style={{ ...tdStyle, color: colors.muted, fontFamily: "var(--app-font-mono)" }}>
                        {health.checks.database.error ?? `${health.checks.database.latencyMs} ms`}
                      </td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Payment provider</td>
                      <td style={tdStyle}>
                        <HealthDot ok={health.checks.paymentProvider.configured} />
                        {health.checks.paymentProvider.provider}
                      </td>
                      <td style={{ ...tdStyle, color: colors.muted }}>
                        {health.checks.paymentProvider.configured
                          ? `${health.checks.paymentProvider.failedCallbacks} failed callbacks, ${health.checks.paymentProvider.pendingCallbacks} awaiting`
                          : "Not configured on this environment"}
                      </td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Subscription payments</td>
                      <td style={tdStyle}>
                        <HealthDot ok={health.checks.payments.failed === 0 && health.checks.payments.stuck.length === 0} />
                        {health.checks.payments.failed} failed
                      </td>
                      <td style={{ ...tdStyle, color: colors.muted }}>
                        {health.checks.payments.stuck.length} stuck past a day
                      </td>
                    </tr>
                    <tr>
                      <td style={tdStyle}>Background jobs</td>
                      <td style={tdStyle}>
                        <HealthDot ok={health.checks.jobs.backgroundFailures === 0} />
                        {health.checks.jobs.backgroundFailures} failures
                      </td>
                      <td style={{ ...tdStyle, color: colors.muted }}>Last 24 hours</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {health.checks.payments.stuck.length > 0 && (
              <Card style={{ display: "grid", gap: 12, borderColor: colors.amber }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Stuck payments</h2>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: colors.muted }}>
                    Initiated more than a day ago and never completed. The club
                    believes it is still subscribed; it is not.
                  </p>
                </div>
                {health.checks.payments.stuck.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex", justifyContent: "space-between", gap: 12,
                      borderTop: `1px solid ${colors.lineSoft}`, paddingTop: 8, fontSize: 13,
                    }}
                  >
                    <span style={{ fontFamily: "var(--app-font-mono)" }}>
                      {p.amount} {p.currency}
                    </span>
                    <span style={{ color: colors.muted }}>since {timeAgo(p.since)}</span>
                    <button style={linkButton} onClick={() => setLocation(`/admin/clients/${p.organizationId}`)}>
                      Open club
                    </button>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}
      </State>

      <div>
        <button style={linkButton} onClick={() => setLocation("/admin")}>Back to overview</button>
      </div>
    </div>
  );
}

function HealthDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block", width: 8, height: 8, borderRadius: 999,
        background: ok ? colors.green : colors.red, marginRight: 8,
      }}
    />
  );
}
