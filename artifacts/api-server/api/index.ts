import app from "../src/app";

/**
 * Vercel serverless entry.
 *
 * The standalone entry (src/index.ts) creates an HTTP server so it can host the
 * realtime WebSocket bus. Serverless functions are request/response and hold no
 * long-lived connections, so nothing is created here: Vercel invokes this
 * handler per request and the Express app handles the routing.
 *
 * The application code is unchanged. The only difference is what wraps it.
 */
export default app;
