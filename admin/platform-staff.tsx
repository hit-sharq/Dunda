import { useMemo, useState } from "react";
import { useGetAdminStaff } from "@/lib/api-client-react/src";
import { Card, State } from "./ui";
import { dateOnly } from "./theme";
import { colors } from "./theme";

interface StaffRow {
  id: string;
  name: string;
  email: string | null;
  organization: string | null;
  role: string;
  status: string;
  linked: boolean;
  createdAt: string;
}

interface AdminStaffResponse {
  administrators: {
    id: string;
    clerkUserId: string | null;
    name: string;
    email: string | null;
    role: string | null;
    status: string;
    createdAt: string;
  }[];
  clubUsers: {
    id: string;
    clerkUserId: string | null;
    name: string;
    email: string | null;
    role: string;
    status: string;
    organizationId: string;
    organizationName: string;
    createdAt: string;
  }[];
  totals: Record<string, number>;
}

function normalizeStaff(data: AdminStaffResponse | undefined): StaffRow[] {
  if (!data) return [];
  const admins: StaffRow[] = data.administrators.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email ?? null,
    organization: "Platform",
    role: u.role ?? "PLATFORM_ADMIN",
    status: u.status ?? "ACTIVE",
    linked: Boolean(u.clerkUserId),
    createdAt: u.createdAt,
  }));
  const clubUsers: StaffRow[] = data.clubUsers.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email ?? null,
    organization: s.organizationName ?? null,
    role: s.role ?? "Staff",
    status: s.status ?? "ACTIVE",
    linked: Boolean(s.clerkUserId),
    createdAt: s.createdAt,
  }));
  return [...admins, ...clubUsers];
}

/**
 * Everyone who can sign in to a client.
 *
 * `linked` is the column that matters: a staff record with no linked account
 * has been created but nobody has accepted their invite yet, so that person
 * cannot sign in and has no access to anything.
 */
export function PlatformStaff() {
  const staff = useGetAdminStaff();
  const [search, setSearch] = useState("");

  const data = staff.data as unknown as AdminStaffResponse | undefined;

  const rows = useMemo<StaffRow[]>(() => {
    const list = normalizeStaff(data);
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q) ||
        (s.organization ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const unlinked = useMemo(
    () => normalizeStaff(data).filter((s) => !s.linked).length,
    [data],
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>People</h1>
        <p style={{ margin: "4px 0 0", color: colors.muted, fontSize: 14 }}>
          Every account across every client. {unlinked} awaiting first sign-in.
        </p>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by person or client"
        style={{
          minHeight: 40,
          borderRadius: 10,
          border: `1px solid ${colors.line}`,
          background: colors.surface,
          padding: "0 12px",
          fontSize: 13,
          maxWidth: 320,
        }}
      />

      <State
        loading={staff.isLoading}
        error={staff.error}
        empty={!staff.isLoading && rows.length === 0}
        emptyTitle="Nobody yet."
        emptyHint="Staff appear here once a client's owner invites them."
        onRetry={() => staff.refetch()}
      >
        {rows.length > 0 && (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: colors.canvas }}>
                  {["Person", "Client", "Role", "Status", "Signed in", "Added"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} style={{ borderTop: `1px solid ${colors.line}` }}>
                    <td style={tdStyle}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{s.name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: colors.mutedSoft }}>
                        {s.email ?? "no email"}
                      </p>
                    </td>
                    <td style={tdStyle}>{s.organization ?? "—"}</td>
                    <td style={tdStyle}>{s.role ?? "—"}</td>
                    <td style={tdStyle}>
                      <span style={{ color: s.status === "ACTIVE" ? colors.green : colors.mutedSoft }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {s.linked ? (
                        <span style={{ color: colors.green }}>yes</span>
                      ) : (
                        <span style={{ color: colors.amber }}>never</span>
                      )}
                    </td>
                    <td style={tdStyle}>{dateOnly(s.createdAt)}</td>
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
