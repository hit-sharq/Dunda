import { eq } from "drizzle-orm";

/**
 * Retries a database call.
 *
 * The pool hands out connections that the provider occasionally drops between
 * queries. That is a transport failure, not a logic failure, and must not be
 * reported as one.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const message = (err as Error)?.message ?? "";
      const transient =
        /ETIMEDOUT|ECONNRESET|ENOTFOUND|Connection terminated|server closed|timeout/i.test(
          message,
        );
      if (!transient) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw last;
}
