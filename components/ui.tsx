import type { ReactNode } from "react";

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: {
  children: ReactNode;
  className?: string;
  variant?: "primary" | "outline" | "ghost" | "dark" | "danger";
  [key: string]: unknown;
}) {
  const variants = {
    primary: "bg-[hsl(var(--app-gold))] text-[hsl(var(--app-ink))] hover:bg-[hsl(var(--app-gold))]",
    outline:
      "border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-info))] hover:border-[hsl(var(--app-gold))] hover:text-[hsl(var(--app-critical))]",
    ghost: "text-[hsl(var(--app-faint))] hover:bg-[hsl(var(--app-line))] hover:text-[hsl(var(--app-ink))]",
    dark: "bg-[hsl(var(--app-info))] text-[hsl(var(--app-warn-soft))] hover:bg-[hsl(var(--app-info))]",
    danger: "bg-[hsl(var(--app-critical))] text-[hsl(var(--app-gold-soft))] hover:bg-[hsl(var(--app-critical))]",
  };
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-[hsl(var(--app-warn-soft))] ${className}`} />;
}

export function PageIntro({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[.2em] text-[hsl(var(--app-faint))]">
          {eyebrow}
        </p>
        <h2 className="font-display text-3xl font-extrabold tracking-[-.04em] text-[hsl(var(--app-ink))] md:text-4xl">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-[hsl(var(--app-ink-soft))]">{detail}</p>
      </div>
      {action}
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
  trend,
  tone = "plain",
}: {
  label: string;
  value: string;
  note: string;
  trend?: "up" | "down";
  tone?: "plain" | "coral" | "green";
}) {
  return (
    <div
      className={`surface rounded-2xl p-4 md:p-5 ${
        tone === "coral"
          ? "bg-[hsl(var(--app-gold))] text-[hsl(var(--app-ink))]"
          : tone === "green"
            ? "bg-[hsl(var(--app-success-soft))]"
            : ""
      }`}
    >
      <div className="mb-4 flex items-start justify-between">
        <span
          className={`text-xs font-semibold uppercase tracking-[.12em] ${
            tone === "plain" ? "text-[hsl(var(--app-muted))]" : "opacity-70"
          }`}
        >
          {label}
        </span>
        {trend && (
          <span
            className={`text-xs font-semibold ${
              trend === "up" ? "text-[hsl(var(--app-success))]" : "text-[hsl(var(--app-critical))]"
            }`}
          >
            {trend === "up" ? "on plan" : "watch"}
          </span>
        )}
      </div>
      <div className="font-display text-3xl font-bold tracking-tight">{value}</div>
      <p
        className={`mt-1 text-xs ${tone === "plain" ? "text-[hsl(var(--app-faint))]" : "opacity-70"}`}
      >
        {note}
      </p>
    </div>
  );
}


export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[hsl(var(--app-info))]/45 p-4">
      <div
        className={`w-full rounded-2xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] p-5 shadow-2xl md:p-6 ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-2xl font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg text-[hsl(var(--app-faint))] hover:bg-[hsl(var(--app-line-soft))]"
            data-testid="button-close-modal"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[hsl(var(--app-faint))]">
      {label}
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-10 w-full rounded-xl border border-[hsl(var(--app-line))] bg-[hsl(var(--app-surface))] px-3 text-sm text-[hsl(var(--app-ink))] outline-none focus:border-[hsl(var(--app-gold))]";

// Money formatting is the organization's own currency, configured by MoneyProvider.
export { money } from "../lib/money";

export const timeAgo = (stamp: string | Date) => {
  const mins = Math.max(
    1,
    Math.floor((Date.now() - new Date(stamp).getTime()) / 60000),
  );
  return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
};
