import type { ReactNode } from "react";
import { describeError, isGenuinelyEmpty } from "../lib/errors";
import { Button, Skeleton } from "./ui";

const toneStyles = {
  error: {
    panel: "bg-[hsl(var(--app-critical-soft))] border-[hsl(var(--app-gold-soft))]",
    title: "text-[hsl(var(--app-critical))]",
    detail: "text-[hsl(var(--app-critical))]",
  },
  warning: {
    panel: "bg-[hsl(var(--app-warn-soft))] border-[hsl(var(--app-warn-soft))]",
    title: "text-[hsl(var(--app-warn))]",
    detail: "text-[hsl(var(--app-warn))]",
  },
  info: {
    panel: "bg-[hsl(var(--app-success-soft))] border-[hsl(var(--app-success-soft))]",
    title: "text-[hsl(var(--app-success))]",
    detail: "text-[hsl(var(--app-success))]",
  },
} as const;

/**
 * The single place a screen reports loading, failure or emptiness.
 *
 * The two states that used to be conflated are now separated: a request that
 * succeeded and returned nothing is an empty state, while a request that failed
 * explains what went wrong and, when retrying could help, offers a retry.
 */
export function QueryNotice({
  loading,
  error,
  empty,
  onRetry,
  what,
  emptyTitle,
  emptyHint,
  emptyAction,
  loadingRows = 3,
}: {
  loading?: boolean;
  /** The query's error object, not a boolean. */
  error?: unknown;
  /** Whether a successful response had no records. */
  empty?: boolean;
  onRetry?: () => void;
  /** Noun for the record type, used in messages. */
  what?: string;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  loadingRows?: number;
}) {
  if (loading) {
    return (
      <div className="grid gap-3 p-5" data-testid="status-loading">
        {Array.from({ length: loadingRows }, (_, i) => (
          <Skeleton key={i} className={i === loadingRows - 1 ? "h-20 w-full" : "h-4 w-2/5"} />
        ))}
      </div>
    );
  }

  if (error) {
    const info = describeError(error, { what });
    const tone = toneStyles[info.tone];
    return (
      <div
        className={`m-4 grid gap-2 rounded-xl border p-4 ${tone.panel}`}
        data-testid="status-error"
        role="alert"
      >
        <p className={`text-sm font-bold ${tone.title}`}>{info.title}</p>
        <p className={`text-xs leading-5 ${tone.detail}`}>{info.detail}</p>
        {info.canRetry && onRetry && (
          <div className="mt-1">
            <Button variant="outline" onClick={onRetry} data-testid="button-retry">
              Try again
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div
        className="grid place-items-center gap-2 p-10 text-center text-sm text-[hsl(var(--app-ink-soft))]"
        data-testid="status-empty"
      >
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[hsl(var(--app-success-soft))] text-[hsl(var(--app-success))]">
          <span className="text-lg">◦</span>
        </div>
        <p className="font-semibold text-[hsl(var(--app-info))]">
          {emptyTitle ?? (what ? `No ${what} yet.` : "Nothing here yet.")}
        </p>
        <p className="max-w-xs text-xs text-[hsl(var(--app-muted))]">
          {emptyHint ??
            (what
              ? `${what[0].toUpperCase()}${what.slice(1)} appear here as soon as they exist.`
              : "Records will appear here as soon as they exist.")}
        </p>
        {emptyAction}
      </div>
    );
  }

  return null;
}

export { isGenuinelyEmpty, describeError };
