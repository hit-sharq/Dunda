/**
 * Retrying a transaction that failed because the connection dropped.
 *
 * The database is reached over the internet and the provider drops pooled
 * connections between queries. Without a retry, a guest ringing in an order
 * during a blip gets a failure and their items are lost, even though the
 * transaction was atomic and nothing was written.
 *
 * Only connection-class failures are retried. A constraint violation or a bad
 * statement would fail identically every time, so those surface immediately
 * rather than being retried into a slower, less honest error.
 */

const TRANSIENT = [
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "Connection terminated",
  "server closed the connection",
  "terminating connection",
  "timeout exceeded",
  "Client has encountered a connection error",
  "Connection is closed",
  "AggregateError",
];

function isTransient(err: unknown): boolean {
  let cursor: unknown = err;
  for (let depth = 0; depth < 5 && cursor; depth += 1) {
    const message =
      (cursor as { message?: string })?.message ??
      (cursor as { cause?: unknown })?.cause instanceof Error
        ? String((cursor as { message?: string }).message ?? "")
        : String((cursor as { message?: string })?.message ?? "");
    if (TRANSIENT.some((t) => message.includes(t))) return true;
    const error = cursor as { cause?: unknown; errors?: unknown[] };
    if (Array.isArray(error.errors) && error.errors.length) {
      cursor = error.errors[0];
      continue;
    }
    cursor = error.cause;
  }
  return false;
}

export async function withTransactionRetry<T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (!isTransient(err) || attempt === attempts - 1) throw err;
      // Brief, growing pause. The connection usually recovers immediately.
      await new Promise((r) => setTimeout(r, 150 * 2 ** attempt));
    }
  }
  throw lastError;
}
