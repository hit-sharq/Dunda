import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";

/**
 * Keeps live screens current by polling.
 *
 * The realtime bus was a WebSocket, which a serverless function cannot hold
 * open. Rather than lose live updates, the screens that need them poll on an
 * interval and refetch from the same API everything else reads.
 *
 * The trade is a little more database traffic in exchange for the boards
 * updating on their own. Two boards in a venue is nothing; a bar on a busy
 * Saturday settles on a five second poll.
 */

/** How often each family of query refreshes itself. */
const INTERVALS: Record<string, number> = {
  // The pass and the order queue change every few seconds during service.
  tickets: 5_000,
  orders: 10_000,
  tabs: 10_000,
  tables: 15_000,
  // Money and reporting can wait; these are read on a screen, not acted on.
  dashboard: 30_000,
  activity: 30_000,
  inventory: 60_000,
  alerts: 60_000,
  reservations: 60_000,
  notifications: 60_000,
};

/** Off-screen tabs do not need to keep asking. */
const VISIBLE_MS = 30_000;

export function useLiveRefresh(enabled: boolean) {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !isSignedIn) return;
    if (typeof document === "undefined") return;

    let lastVisibleAt = Date.now();

    const markActive = () => {
      lastVisibleAt = Date.now();
    };
    document.addEventListener("visibilitychange", markActive);
    window.addEventListener("focus", markActive);

    const timer = setInterval(() => {
      // A backgrounded tab is not being watched, so it stops asking.
      if (Date.now() - lastVisibleAt > VISIBLE_MS) return;
      if (typeof document !== "undefined" && document.hidden) return;

      for (const [name, ms] of Object.entries(INTERVALS)) {
        // Only the families whose interval has elapsed are invalidated.
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            if (!Array.isArray(key) || typeof key[0] !== "string") return false;
            if (!key[0].toLowerCase().includes(name)) return false;
            const state = queryClient.getQueryState(key);
            if (!state) return false;
            return Date.now() - (state.dataUpdatedAt || 0) >= ms;
          },
        });
      }
    }, 3_000);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", markActive);
      window.removeEventListener("focus", markActive);
    };
  }, [enabled, isSignedIn, queryClient]);
}
