import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { staffTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { issueRealtimeTicket } from "../lib/realtimeTickets";

const router: IRouter = Router();

/**
 * Exchanges the session token for a short-lived realtime ticket.
 *
 * The browser cannot put an Authorization header on a WebSocket handshake, so
 * the session token used to go in the URL. This keeps it in a header where it
 * belongs and puts a 30-second single-use code in the URL instead.
 */
router.post("/ticket", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // A ticket only makes sense for an account that still has a staff record.
  const [staff] = await db
    .select({ id: staffTable.id, status: staffTable.status })
    .from(staffTable)
    .where(eq(staffTable.clerkUserId, userId));
  if (!staff || staff.status !== "ACTIVE") {
    res.status(403).json({ error: "No active staff record for this account." });
    return;
  }

  try {
    res.json({ ticket: issueRealtimeTicket(userId), expiresInSeconds: 30 });
  } catch {
    res.status(503).json({ error: "Realtime is busy. Try again in a moment." });
  }
});

export default router;
