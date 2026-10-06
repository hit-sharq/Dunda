import { PrismaClient } from "@prisma/client";

/**
 * Fail loudly rather than quietly when the pool is exhausted.
 *
 * Prisma's default is to sit in a queue until the timeout and then report
 * "timed out fetching a new connection", which reads as a broken database when
 * it is really one query waiting behind another. A route that fires a dozen
 * queries in parallel — the console overview does — needs a pool that can hold
 * them.
 *
 * The connection limit is set past the busiest endpoint rather than at an
 * average. /dashboard/summary fires seventeen queries in parallel and
 * /admin/summary fifteen, so anything under twenty leaves the busiest screens
 * waiting on themselves. With one connection every query serialised behind a
 * single one and each timed out at ten seconds, which surfaced as the console
 * answering 500 while the database was perfectly healthy.
 */
const POOL_SIZE = Number(process.env.DATABASE_POOL_SIZE ?? 20);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: {
      db: { url: withPoolSettings(process.env.DATABASE_URL) },
    },
  });

/**
 * Applies the pool settings to the connection string.
 *
 * Kept here as well as in the environment file so the two cannot drift: a
 * DATABASE_URL without these is what produced a console that answered every
 * request with a database timeout, and that failure mode is not obvious from
 * looking at the URL. Values already present are left alone, so an environment
 * that has been tuned deliberately is not overridden.
 */
function withPoolSettings(url: string | undefined): string | undefined {
  if (!url) return url;
  const separator = url.includes("?") ? "&" : "?";
  if (url.includes("connection_limit=")) return url;
  return `${url}${separator}connection_limit=${POOL_SIZE}&pool_timeout=20`;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
