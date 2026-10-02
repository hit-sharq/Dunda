import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Health of the pieces the platform depends on: the database, the payment
 * provider, failed callbacks, and stuck payments.
 *
 * Each check says what it found rather than only whether it passed, because the
 * person reading this at 3am needs to know which part is down, not just that
 * something is.
 */
export const GET = route(async () => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const startedAt = Date.now();
  let database: { status: string; latencyMs: number; error?: string };
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { status: "up", latencyMs: Date.now() - startedAt };
  } catch (error) {
    database = {
      status: "down",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "The database did not answer.",
    };
  }

  const now = Date.now();
  const dayAgo = new Date(now - 86400000);

  const [failedCallbacks, pendingCallbacks, failedPayments, pendingPayments, webhookErrors, recentErrors] =
    await Promise.all([
      prisma.dunda_payment_notifications.count({
        where: { outcome: "REJECTED", received_at: { gte: dayAgo } },
      }),
      prisma.dunda_payment_notifications.count({
        where: { processed_at: null, received_at: { gte: dayAgo } },
      }),
      prisma.dunda_billing_payments.count({ where: { status: "FAILED" } }),
      prisma.dunda_billing_payments.count({
        where: { status: { in: ["INITIATED", "PENDING"] }, created_at: { gte: dayAgo } },
      }),
      // A payment attempt that never resolved is the signature of a provider
      // callback that went missing.
      prisma.dunda_payment_attempts.count({
        where: { status: { in: ["INITIATED", "PENDING"] }, requested_at: { gte: dayAgo } },
      }),
      prisma.dunda_audit_logs.count({
        where: { action: "DELETE", created_at: { gte: dayAgo } },
      }),
    ]);

  // A payment stuck in INITIATED for over a day is not a slow provider, it is a
  // club whose renewal never completed and who believes they are still subscribed.
  const stuck = await prisma.dunda_billing_payments.findMany({
    where: { status: { in: ["INITIATED", "PENDING"] }, created_at: { lt: dayAgo } },
    orderBy: { created_at: "asc" },
    take: 10,
    select: { id: true, organization_id: true, amount: true, currency: true, created_at: true },
  });

  const issues = [
    database.status === "down" ? "Database" : null,
    failedPayments > 0 ? `${failedPayments} failed subscription payments` : null,
    stuck.length > 0 ? `${stuck.length} payments stuck past a day` : null,
    failedCallbacks > 0 ? `${failedCallbacks} rejected callbacks in 24h` : null,
    pendingCallbacks > 0 ? `${pendingCallbacks} callbacks awaiting processing` : null,
  ].filter((issue): issue is string => issue !== null);

  return NextResponse.json({
    status: issues.length === 0 ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    checks: {
      database,
      paymentProvider: {
        // The provider is only configured, not contacted: a health screen that
        // charged something to check would be worse than useless.
        provider: "PESAPAL",
        configured: Boolean(process.env.PESAPAL_CONSUMER_KEY),
        failedCallbacks,
        pendingCallbacks,
      },
      payments: {
        failed: failedPayments,
        pending: pendingPayments,
        unresolvedAttempts: webhookErrors,
        stuck: stuck.map((p) => ({
          id: p.id,
          organizationId: p.organization_id,
          amount: p.amount,
          currency: p.currency,
          since: p.created_at.toISOString(),
        })),
      },
      jobs: {
        // No scheduler runs in this process; the count below is the number of
        // club payments whose subscription callback has not been processed.
        backgroundFailures: recentErrors,
      },
    },
    issues,
  });
});
