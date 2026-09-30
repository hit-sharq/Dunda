import type { ReactNode } from "react";
import { describeError, isGenuinelyEmpty } from "../lib/errors";
import { Button, Skeleton } from "./ui";

const toneStyles = {
  error: {
    panel: "bg-[#fbeae5] border-[#e6bdb2]",
    title: "text-[#a3452e]",
    detail: "text-[#8a5140]",
  },
  warning: {
    panel: "bg-[#fbf2d9] border-[#e7d39c]",
    title: "text-[#92702b]",
    detail: "text-[#7d6636]",
  },
  info: {
    panel: "bg-[#e9efee] border-[#cfdedb]",
    title: "text-[#3f6b62]",
    detail: "text-[#4f736a]",
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
        className="grid place-items-center gap-2 p-10 text-center text-sm text-[#69736f]"
        data-testid="status-empty"
      >
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f0ed] text-[#397f71]">
          <span className="text-lg">◦</span>
        </div>
        <p className="font-semibold text-[#273239]">
          {emptyTitle ?? (what ? `No ${what} yet.` : "Nothing here yet.")}
        </p>
        <p className="max-w-xs text-xs text-[#859089]">
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
