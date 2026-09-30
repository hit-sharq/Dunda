import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";

type Topic =
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "ORDER_STATUS_CHANGED"
  | "TABLE_STATUS_CHANGED"
  | "PAYMENT_COMPLETED"
  | "INVENTORY_UPDATED"
  | "RESERVATION_CREATED"
  | "RESERVATION_UPDATED"
  | "NOTIFICATION";

/**
 * Subscribes to the shared realtime bus and invalidates the affected queries.
 *
 * The socket only says "this changed" — the client then refetches from the same
 * API every other client reads. There is no second source of truth and no
 * duplicated order or inventory state.
 */
export function useRealtime(enabled: boolean) {
  const { getToken, isSignedIn } = useAuth();
  const qc = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);

  /** The same bearer header every other API call uses. */
  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    if (!enabled || !isSignedIn) return;

    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      if (closed) return;

      // Exchange the session token for a short-lived ticket. A WebSocket
      // handshake cannot carry an Authorization header, so passing the session
      // token in the URL would write it to every access log on the way through.
      let ticket: string;
      try {
        const res = await fetch("/api/realtime/ticket", {
          method: "POST",
          credentials: "include",
          headers: await authHeaders(),
        });
        if (!res.ok) throw new Error("ticket refused");
        ticket = (await res.json()).ticket;
      } catch {
        if (!closed) retry = setTimeout(() => void connect(), 8000);
        return;
      }
      if (closed) return;

      const base = window.location.origin;
      const protocol = base.startsWith("https") ? "wss" : "ws";
      const url = `${protocol}://${base.replace(/^https?:\/\//, "")}/realtime?ticket=${encodeURIComponent(ticket)}`;

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onmessage = (message) => {
        let event: { topic?: Topic };
        try {
          event = JSON.parse(message.data);
        } catch {
          return;
        }
        if (!event.topic) return;

        switch (event.topic) {
          case "ORDER_CREATED":
          case "ORDER_UPDATED":
          case "ORDER_STATUS_CHANGED":
            void qc.invalidateQueries({ queryKey: ["getOrders"] });
            void qc.invalidateQueries({ queryKey: ["getDashboardSummary"] });
            void qc.invalidateQueries({ queryKey: ["getDashboardActivity"] });
            break;
          case "TABLE_STATUS_CHANGED":
            void qc.invalidateQueries({ queryKey: ["getBranchFloor"] });
            void qc.invalidateQueries({ queryKey: ["getFloorTables"] });
            void qc.invalidateQueries({ queryKey: ["getTabs"] });
            break;
          case "PAYMENT_COMPLETED":
            void qc.invalidateQueries({ queryKey: ["getTabs"] });
            void qc.invalidateQueries({ queryKey: ["getPayments"] });
            void qc.invalidateQueries({ queryKey: ["getDashboardSummary"] });
            break;
          case "INVENTORY_UPDATED":
            void qc.invalidateQueries({ queryKey: ["getInventory"] });
            void qc.invalidateQueries({ queryKey: ["getInventoryAlerts"] });
            void qc.invalidateQueries({ queryKey: ["getProducts"] });
            break;
          case "RESERVATION_CREATED":
          case "RESERVATION_UPDATED":
            void qc.invalidateQueries({ queryKey: ["getReservations"] });
            void qc.invalidateQueries({ queryKey: ["getDashboardSummary"] });
            break;
          case "NOTIFICATION":
            void qc.invalidateQueries({ queryKey: ["getNotifications"] });
            void qc.invalidateQueries({ queryKey: ["getNotificationUnreadCount"] });
            break;
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (!closed) retry = setTimeout(() => void connect(), 4000);
      };

      socket.onerror = () => socket.close();
    }

    void connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, isSignedIn, getToken, qc]);
}
