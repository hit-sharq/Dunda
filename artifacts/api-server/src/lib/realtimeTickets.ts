import { randomBytes, createHash } from "node:crypto";

/**
 * Short-lived tickets for the realtime socket.
 *
 * The browser WebSocket API cannot set headers, so a session token had to be
 * passed in the URL, where it lands in access logs, proxy logs and browser
 * history. Anyone able to read those could impersonate any signed-in user.
 *
 * Instead the client exchanges its bearer token for a ticket that expires in
 * half a minute and is destroyed on first use. The long-lived session token
 * never leaves an Authorization header.
 */

const TTL_MS = 30_000;
const MAX_TICKETS = 5_000;

interface Ticket {
  token: string;
  clerkUserId: string;
  expiresAt: number;
}

const tickets = new Map<string, Ticket>();

/** Drop anything already expired, so the map cannot grow without bound. */
function sweep(): void {
  const now = Date.now();
  for (const [token, ticket] of tickets) {
    if (ticket.expiresAt <= now) tickets.delete(token);
  }
}

export function issueRealtimeTicket(clerkUserId: string): string {
  if (tickets.size >= MAX_TICKETS) sweep();
  if (tickets.size >= MAX_TICKETS) {
    // Refuse rather than evict: under this much pressure the socket is
    // misbehaving and dropping a live ticket would be worse.
    throw new Error("Too many realtime tickets outstanding");
  }
  const token = randomBytes(24).toString("base64url");
  tickets.set(token, { token, clerkUserId, expiresAt: Date.now() + TTL_MS });
  return token;
}

/**
 * Redeems a ticket for the account it was issued to. Single use: a replayed
 * ticket finds nothing, because it is removed here whether or not it matched.
 */
export function redeemRealtimeTicket(token: string): string | null {
  const ticket = tickets.get(token);
  if (!ticket) return null;
  tickets.delete(token);
  if (ticket.expiresAt <= Date.now()) return null;
  return ticket.clerkUserId;
}

/** Used only in tests, so a scenario can start from a known state. */
export function _clearRealtimeTickets(): void {
  tickets.clear();
}

export const __testing = { hash: (v: string) => createHash("sha256").update(v).digest("hex") };
