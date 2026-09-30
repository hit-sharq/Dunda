import { createServer } from "node:http";
import { verifyToken } from "@clerk/backend";
import app from "./app";
import { logger } from "./lib/logger";
import { attachRealtime } from "./lib/realtime";
import { db } from "@workspace/db";
import { staffTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const rawPort = process.env["PORT"] ?? "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Resolves a Clerk account id to the Dunda tenant it belongs to, so realtime
 * sockets are scoped exactly like REST requests.
 */
async function resolveIdentity(userId: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  try {
    const [staff] = await db
      .select()
      .from(staffTable)
      .where(eq(staffTable.clerkUserId, userId));
    if (!staff || staff.status !== "ACTIVE") return null;
    return { organizationId: staff.organizationId, branchId: staff.branchId ?? null };
  } catch (err) {
    logger.warn({ err }, "Realtime identity lookup failed");
    return null;
  }
}

/** Verifies a raw session token, used only by the ticket exchange path. */
async function verifySessionToken(token: string) {
  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      logger.warn("CLERK_SECRET_KEY is not set; realtime is unavailable");
      return null;
    }
    const session = await verifyToken(token, { secretKey });
    const userId: string | undefined =
      typeof session.userId === "string"
        ? session.userId
        : typeof session.sub === "string"
          ? session.sub
          : undefined;
    if (!userId) return null;
    return resolveIdentity(userId);
  } catch (err) {
    logger.warn({ err }, "Realtime token verification failed");
    return null;
  }
}

const server = createServer(app);

if (process.env.ENABLE_REALTIME === "true") {
  // The same resolver re-checks on an interval, so deactivating a member closes
  // their live feed rather than leaving it open for the rest of the shift.
  attachRealtime(server, resolveIdentity, resolveIdentity);
  logger.info("Realtime enabled on /realtime");
}

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
