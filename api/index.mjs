/**
 * Vercel serverless function entry.
 *
 * Vercel only discovers functions inside a root `api/` directory, so this file is
 * the path the platform looks at. It re-exports the handler that the build step
 * pre-bundles, which keeps the platform from having to resolve the pnpm
 * workspace and compile the monorepo itself.
 *
 * The build command runs before functions are compiled, so the bundle it writes
 * to artifacts/api-server/dist/serverless is present by the time this is read.
 */
export { default } from "../artifacts/api-server/dist/serverless/handler.mjs";

// A function is invoked per request and holds no connection open, so the
// longest operation is a report query rather than anything long lived.
export const config = { maxDuration: 30, memory: 1024 };
