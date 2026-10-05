import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, inputStyle, linkButton, primaryButton, State, labelStyle, thStyle, tdStyle, tableStyle } from "./ui";
import { colors, timeAgo } from "./theme";

interface Ticket {
  id: string;
  organizationName: string | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  body: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * Support tickets raised by clubs.
 *
 * No generated client hook exists for this endpoint, so it is read directly rather
 * than widening the client to cover one screen. The shape is declared here, which
 * means a change to the endpoint is a type error here rather than a blank list at
 * runtime.
 */
export function Support() {
  const [, setLocation] = useLocation();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Ticket | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = status ? `?status=${encodeURIComponent(status)}` : "";
      const response = await fetch(`/api/admin/support${query}`, { credentials: "include" });
      const body = (await response.json()) as Ticket[] | { error: string };
      if (!response.ok) throw (body as { error: string }).error ?? "Could not read tickets.";
      setTickets(body as Ticket[]);
    } catch (cause) {
      setError(cause);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = (tickets ?? []).filter((t) => t.status === "OPEN").length;

  async function closeTicket(id: string) {
    await fetch(`/api/admin/support/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CLOSED", resolution: "Closed from the console." }),
    });
    setOpen(null);
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Support</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          Tickets raised by clubs.
          {openCount > 0 ? ` ${openCount} still open.` : " Nothing open right now."}
        </p>
      </div>

      <Card style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Tickets</h2>
          <div style={{ width: 190 }}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={inputStyle}
              data-testid="select-ticket-status"
            >
              <option value="">Every status</option>
              {["OPEN", "IN_PROGRESS", "WAITING", "CLOSED"].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <State
          loading={loading}
          error={error}
          emptyTitle={status ? `Nothing ${status.toLowerCase()}.` : "No tickets yet."}
          emptyHint={
            status
              ? "Clear the filter to see the rest."
              : "A club raises one from its settings screen."
          }
          empty={!loading && !error && (tickets ?? []).length === 0}
          onRetry={() => void load()}
        >
          <div style={tableStyle}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Club</th>
                  <th style={thStyle}>Subject</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Priority</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Raised</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {(tickets ?? []).map((t) => (
                  <tr key={t.id}>
                    <td style={tdStyle}>{t.organizationName ?? "Platform"}</td>
                    <td style={tdStyle}>{t.subject}</td>
                    <td style={{ ...tdStyle, color: colors.muted }}>{t.category.replace(/_/g, " ").toLowerCase()}</td>
                    <td style={tdStyle}>
                      <span style={{ color: t.priority === "HIGH" || t.priority === "URGENT" ? colors.red : colors.muted }}>
                        {t.priority.toLowerCase()}
                      </span>
                    </td>
                    <td style={tdStyle}>{t.status.toLowerCase()}</td>
                    <td style={{ ...tdStyle, color: colors.muted, whiteSpace: "nowrap" }}>{timeAgo(t.createdAt)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button style={linkButton} onClick={() => setOpen(t)}>Read</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </State>
      </Card>

      {open && (
        <Card style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{open.subject}</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.muted }}>
                {open.organizationName ?? "Platform"} · {timeAgo(open.createdAt)}
              </p>
            </div>
            <button style={linkButton} onClick={() => setOpen(null)}>Close</button>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", color: colors.inkSoft }}>
            {open.body}
          </p>
          {open.resolution && (
            <p style={{ margin: 0, fontSize: 13, color: colors.green }}>{open.resolution}</p>
          )}
          {open.status !== "CLOSED" && (
            <div>
              <button style={primaryButton} onClick={() => void closeTicket(open.id)}>
                Mark resolved
              </button>
            </div>
          )}
        </Card>
      )}

      <div>
        <button style={linkButton} onClick={() => setLocation("/admin")}>Back to overview</button>
      </div>
    </div>
  );
}
