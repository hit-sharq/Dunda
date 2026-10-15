import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";




const INTERVALS: Record<string, number> = {
  
  tickets: 5_000,
  orders: 10_000,
  tabs: 10_000,
  tables: 15_000,
  
  dashboard: 30_000,
  activity: 30_000,
  inventory: 60_000,
  alerts: 60_000,
  reservations: 60_000,
  notifications: 60_000,
};


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
      
      if (Date.now() - lastVisibleAt > VISIBLE_MS) return;
      if (typeof document !== "undefined" && document.hidden) return;

      for (const [name, ms] of Object.entries(INTERVALS)) {
        
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