/**
 * How long an interactive transaction is allowed to run.
 *
 * Prisma's default is five seconds, which is enough for a single write and not
 * enough for what the till actually does: opening a tab reads the product, the
 * unit and the counter, writes the line, recalculates the bill and writes the
 * audit entry. Against a pooled connection that sits between queries, the default
 * expires mid-way and the work is rolled back with an error that names the wrong
 * statement.
 *
 * Twenty seconds is generous for the work involved and still far below anything a
 * person would notice. If a transaction ever runs that long, something is wrong
 * with it and the timeout is what stops it taking the connection with it.
 */
export const TRANSACTION_OPTIONS = {
  /** How long to wait for a free connection before giving up. */
  maxWait: 10_000,
  /** How long the transaction may run once it has a connection. */
  timeout: 20_000,
} as const;
