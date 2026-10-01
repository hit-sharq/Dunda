import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { colors, money } from "../lib/theme";
import { PlatformStaff } from "./platform-staff";
import { AuditTrail } from "./audit-trail";
import { NewClient } from "./new-client";
import { ClientDetail } from "./client-detail";
import { Clients } from "./clients";

/**
 * The admin shell.
 *
 * Deliberately not the club app's shell. A club is a working surface used on a
 * tablet in a dark room; this is an operator console, and keeping them visually
 * and structurally separate makes it obvious which one you are in.
 */

const LINKS = [
  { href: "/", label: "Clients" },
  { href: "/staff", label: "People" },
  { href: "/audit", label: "Audit" },
  { href: "/new", label: "New client" },
];

export function AdminShell() {
  const [location, setLocation] = useLocation();

  return (
    <div style={{ minHeight: "100dvh", background: colors.canvas }}>
      <header
        style={{
          background: colors.inkSoft,
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: colors.accent,
              color: colors.ink,
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
            }}
          >
            D
          </span>
          <div>
            <p
              style={{
                color: "#9fb0a8",
                fontSize: 10,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              Dunda
            </p>
            <p style={{ color: "#f6efe2", fontWeight: 700, margin: 0, fontSize: 15 }}>
              Operator console
            </p>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {LINKS.map((l) => {
            const active = location === l.href;
            return (
              <button
                key={l.href}
                onClick={() => setLocation(l.href)}
                style={{
                  minHeight: 38,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  background: active ? colors.accent : "transparent",
                  color: active ? colors.ink : "#aebdb6",
                }}
              >
                {l.label}
              </button>
            );
          })}
        </nav>
      </header>
      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 20px 64px" }}>
        <Routes location={location} />
      </main>
      <footer
        style={{
          maxWidth: 1320,
          margin: "0 auto",
          padding: "16px 20px 32px",
          borderTop: `1px solid ${colors.line}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: colors.mutedSoft,
        }}
      >
        <span>Dunda operator console</span>
        <span>© {new Date().getFullYear()} Dunda</span>
      </footer>
    </div>
  );
}

function Routes({ location }: { location: string }) {
  if (location === "/staff") return <PlatformStaff />;
  if (location === "/audit") return <AuditTrail />;
  if (location === "/new") return <NewClient />;
  if (location.startsWith("/clients/")) {
    return <ClientDetail id={location.replace("/clients/", "")} />;
  }
  if (location === "/") return <Clients />;
  return <Clients />;
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.line}`,
        borderRadius: 18,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <p
        style={{
          margin: 0,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: colors.mutedSoft,
        }}
      >
        {label}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 800 }}>{value}</p>
      {note ? (
        <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.muted }}>{note}</p>
      ) : null}
    </Card>
  );
}

export function State({
  loading,
  error,
  empty,
  emptyTitle,
  emptyHint,
  onRetry,
  children,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  if (loading) {
    return (
      <Card>
        <p style={{ margin: 0, color: colors.muted }}>Loading…</p>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <p style={{ margin: 0, fontWeight: 700, color: colors.red }}>
          Could not load this.
        </p>
        {onRetry ? (
          <button style={linkButton} onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </Card>
    );
  }
  if (empty) {
    return (
      <Card>
        <p style={{ margin: 0, fontWeight: 700 }}>{emptyTitle}</p>
        {emptyHint ? (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.muted }}>
            {emptyHint}
          </p>
        ) : null}
      </Card>
    );
  }
  return <>{children}</>;
}

export const linkButton: React.CSSProperties = {
  marginTop: 8,
  minHeight: 36,
  padding: "0 14px",
  borderRadius: 10,
  border: `1px solid ${colors.line}`,
  background: colors.surface,
  color: colors.ink,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

export const primaryButton: React.CSSProperties = {
  minHeight: 44,
  padding: "0 20px",
  borderRadius: 12,
  border: "none",
  background: colors.accent,
  color: colors.ink,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

export const inputStyle: React.CSSProperties = {
  minHeight: 42,
  width: "100%",
  borderRadius: 12,
  border: `1px solid ${colors.line}`,
  background: "#fffefb",
  padding: "0 12px",
  fontSize: 14,
  color: colors.ink,
  boxSizing: "border-box",
};

export function field(label: string, node: ReactNode, hint?: string) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted }}>{label}</span>
      {node}
      {hint ? (
        <span style={{ fontSize: 11, color: colors.mutedSoft }}>{hint}</span>
      ) : null}
    </label>
  );
}

export { money };
