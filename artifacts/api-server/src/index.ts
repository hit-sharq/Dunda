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
 * Resolves a Clerk session token to the Dunda tenant it belongs to, so realtime
 * sockets are scoped exactly like REST requests.
 */
async function resolveIdentity(token: string) {
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

    const [staff] = await db
      .select()
      .from(staffTable)
      .where(eq(staffTable.clerkUserId, userId));

    if (staff) {
      return {
        organizationId: staff.organizationId,
        branchId: staff.branchId ?? null,
      };
    }
    return null;
  } catch (err) {
    logger.warn({ err }, "Realtime token verification failed");
    return null;
  }
}

const server = createServer(app);

if (process.env.ENABLE_REALTIME === "true") {
  attachRealtime(server, resolveIdentity);
  logger.info("Realtime enabled on /realtime");
}

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
