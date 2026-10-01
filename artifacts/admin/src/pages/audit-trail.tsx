import { useMemo, useState } from "react";
import { useGetAdminAuditLogs, useGetAdminOrganizations } from "@workspace/api-client-react";
import { Card, State } from "./shell";
import { colors, dateOnly } from "../lib/theme";

/**
 * The trail, across every client.
 *
 * Reading a client's activity is the main reason an operator needs this: when a
 * club says a refund went missing, the answer is here rather than in a
 * conversation. Support is read-only, so this shows what happened and never
 * changes anything.
 */
export function AuditTrail() {
  const orgs = useGetAdminOrganizations();
  const [organizationId, setOrganizationId] = useState("");
  const logs = useGetAdminAuditLogs(
    { organizationId: organizationId || undefined, limit: 200 },
    { query: { queryKey: ["getAdminAuditLogs", organizationId] } },
  );

  const rows = useMemo(() => logs.data ?? [], [logs.data]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Audit</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          Every recorded action, across every client.
        </p>
      </div>

      <select
        value={organizationId}
        onChange={(e) => setOrganizationId(e.target.value)}
        style={{
          minHeight: 40,
          borderRadius: 10,
          border: `1px solid ${colors.line}`,
          background: "#fffefb",
          padding: "0 12px",
          fontSize: 13,
          maxWidth: 280,
        }}
      >
        <option value="">All clients</option>
        {orgs.data?.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>

      <State
        loading={logs.isLoading}
        error={logs.error}
        empty={!logs.isLoading && rows.length === 0}
        emptyTitle="Nothing recorded yet."
        emptyHint="Actions on orders, stock, staff and settings land here."
        onRetry={() => logs.refetch()}
      >
        {rows.length > 0 && (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: colors.canvas }}>
                  {["When", "Client", "Action", "What", "Detail"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} style={{ borderTop: `1px solid ${colors.line}` }}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{dateOnly(l.createdAt)}</td>
                    <td style={tdStyle}>{l.organization ?? l.organizationId}</td>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 700 }}>{l.action}</span>
                    </td>
                    <td style={tdStyle}>{l.entity}</td>
                    <td style={{ ...tdStyle, color: colors.muted }}>{l.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </State>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 10,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: colors.mutedSoft,
  fontWeight: 700,
};
const tdStyle: React.CSSProperties = { padding: "12px 14px" };
