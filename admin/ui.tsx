import type { ReactNode } from "react";
import { colors, money } from "./theme";

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
  background: colors.surface,
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
