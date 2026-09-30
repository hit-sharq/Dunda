import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

/**
 * Dunda's realtime bus.
 *
 * Every client — web POS, bar display, kitchen display, manager phone — reads
 * from the same PostgreSQL-backed API. This layer only pushes notifications that
 * something changed, so clients can invalidate and refetch rather than holding
 * their own copy of the truth.
 *
 * Payloads never carry row data: they carry a topic and the entity id, scoped to
 * the organization and branch the socket is authenticated for.
 */

export type RealtimeTopic =
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "ORDER_STATUS_CHANGED"
  | "TABLE_STATUS_CHANGED"
  | "PAYMENT_COMPLETED"
  | "INVENTORY_UPDATED"
  | "RESERVATION_CREATED"
  | "RESERVATION_UPDATED"
  | "NOTIFICATION";

export interface RealtimeEvent {
  topic: RealtimeTopic;
  organizationId: string;
  branchId: string | null;
  entityId?: string | null;
  at?: string;
}

interface Client {
  socket: WebSocket;
  organizationId: string;
  branchId: string | null;
}

const clients = new Set<Client>();
let wss: WebSocketServer | null = null;

function send(client: Client, payload: unknown) {
  if (client.socket.readyState !== WebSocket.OPEN) return;
  client.socket.send(JSON.stringify(payload));
}

/**
 * Attaches the realtime server. Sockets authenticate with the same Clerk token
 * the REST API uses, and are then pinned to one organization and branch so a
 * client can never observe another tenant's activity.
 */
export function attachRealtime(
  server: Server,
  verifyToken: (token: string) => Promise<{ organizationId: string; branchId: string | null } | null>,
) {
  wss = new WebSocketServer({ server, path: "/realtime" });

  wss.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      socket.close(1008, "Authentication required");
      return;
    }

    void verifyToken(token)
      .then((identity) => {
        if (!identity) {
          socket.close(1008, "Authentication required");
          return;
        }
        const client: Client = {
          socket,
          organizationId: identity.organizationId,
          branchId: identity.branchId,
        };
        clients.add(client);
        send(client, { type: "ready", at: new Date().toISOString() });

        socket.on("close", () => clients.delete(client));
        socket.on("error", () => clients.delete(client));
        socket.on("message", (raw) => {
          // The only supported client message is a keepalive.
          if (raw.toString() === "ping") send(client, { type: "pong" });
        });
      })
      .catch(() => socket.close(1011, "Authentication failed"));
  });

  return wss;
}

/** Broadcasts to every client in the organization, honouring branch scoping. */
export function publish(event: RealtimeEvent): void {
  if (!wss) return;
  const payload = { ...event, at: event.at ?? new Date().toISOString() };
  for (const client of clients) {
    if (client.organizationId !== event.organizationId) continue;
    if (
      event.branchId &&
      client.branchId &&
      client.branchId !== event.branchId
    ) {
      continue;
    }
    send(client, payload);
  }
}

export function realtimeClientCount(): number {
  return clients.size;
}
