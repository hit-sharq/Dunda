import { createServer } from "node:http";
import { logger } from "./lib/logger";
import app from "./app";

/**
 * The standalone API process, used by `pnpm dev` and by any host that runs a
 * long-lived Node server.
 *
 * On serverless hosting this file is not used: artifacts/api-server/api/index.ts
 * exports the Express app directly, because a function is invoked per request
 * and cannot hold a connection open. The realtime WebSocket bus that once lived
 * here is gone for the same reason; live screens poll instead.
 */

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
