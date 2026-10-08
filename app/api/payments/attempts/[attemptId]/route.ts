import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession } from "@/lib/server/http";
import { confirmClubPayment } from "@/lib/server/payments";

export const dynamic = "force-dynamic";

/**
 * The state of one provider payment, for a till waiting on a
 * guest to finish paying on their phone.
 *
 * The webhook is what settles a payment, but a notification can
 * be lost, so a poll for an attempt that has been waiting is
 * also a chance to ask the provider directly. The confirmation
 * is idempotent, so a poll that races the webhook changes
 * nothing.
 */
export const GET = route(
  async (request: Request, context: { params: Promise<{ attemptId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { attemptId } = await context.params;

    const attempt = await prisma.dunda_payment_attempts.findFirst({
      where: { id: attemptId, organization_id: organizationId },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        method: true,
        reference: true,
        failure_reason: true,
        requested_at: true,
        resolved_at: true,
        payment_id: true,
        tab_id: true,
      },
    });
    if (!attempt) {
      return NextResponse.json(
        { error: "That payment attempt no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    // An attempt that has been waiting half a minute is asked
    // about directly. Thirty seconds is long enough that the
    // webhook has had its chance, and short enough that a
    // guest mid-payment is not disturbed by the question.
    const waiting =
      attempt.status === "INITIATED" &&
      Date.now() - attempt.requested_at.getTime() > 30_000;
    if (waiting) {
      try {
        await confirmClubPayment(attemptId);
      } catch {
        // The provider is unreachable, which the poll
        // reports as the attempt it already knows about
        // rather than as an error the till cannot act on.
      }
      const refreshed = await prisma.dunda_payment_attempts.findUniqueOrThrow({
        where: { id: attemptId },
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          method: true,
          reference: true,
          failure_reason: true,
          requested_at: true,
          resolved_at: true,
          payment_id: true,
          tab_id: true,
        },
      });
      return NextResponse.json(serialize(refreshed));
    }

    return NextResponse.json(serialize(attempt));
  },
);

function serialize(attempt: {
  id: string;
  status: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  failure_reason: string | null;
  requested_at: Date;
  resolved_at: Date | null;
  payment_id: string | null;
  tab_id: string | null;
}) {
  return {
    id: attempt.id,
    status: attempt.status,
    amount: attempt.amount,
    currency: attempt.currency,
    method: attempt.method,
    reference: attempt.reference,
    failureReason: attempt.failure_reason,
    requestedAt: attempt.requested_at.toISOString(),
    resolvedAt: attempt.resolved_at?.toISOString() ?? null,
    paymentId: attempt.payment_id,
    tabId: attempt.tab_id,
  };
}
