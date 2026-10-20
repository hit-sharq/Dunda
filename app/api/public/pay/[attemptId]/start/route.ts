import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { createOrder as createPesapalOrder } from "@/lib/server/pesapal";
import { getOrganizationPesapalCredentials } from "@/lib/server/pesapal-credentials";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The customer taps "Pay". We turn the waiter's attempt into a real Pesapal
 * order and hand back the redirect so they can approve with M-Pesa.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ attemptId: string }> }) => {
    checkRateLimit(clientIpKey(request), 20, 60 * 60 * 1000);

    const { attemptId } = await context.params;

    const attempt = await prisma.dunda_payment_attempts.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        organization_id: true,
        branch_id: true,
        tab_id: true,
        amount: true,
        currency: true,
        method: true,
        status: true,
        reference: true,
        dunda_tabs: {
          select: {
            number: true,
            total: true,
            amount_paid: true,
            outstanding: true,
            dunda_branches: { select: { name: true, phone: true, email: true } },
          },
        },
      },
    });

    if (!attempt) throw notFound("That payment");

    if (attempt.status === "RESOLVED") {
      throw wrongState("That payment has already gone through.");
    }

    if (attempt.status === "FAILED") {
      throw wrongState("That payment failed. Ask your server for a new code.");
    }

    if (!attempt.tab_id) {
      throw wrongState("That payment is not linked to a bill.");
    }

    const tab = attempt.dunda_tabs;
    if (!tab) throw notFound("That bill");

    // Guard against paying more than is still owed.
    const outstanding = Math.max(0, tab.total - tab.amount_paid);
    if (outstanding <= 0) {
      throw wrongState("That bill is already settled.");
    }
    if (attempt.amount > outstanding) {
      throw wrongState("That bill has changed. Ask your server for a new code.");
    }

    const credentials = await getOrganizationPesapalCredentials(attempt.organization_id);

    const pesapalOrder = await createPesapalOrder({
      id: attempt.id,
      amount: attempt.amount,
      currency: attempt.currency,
      description: `Bill ${tab.number} at ${tab.dunda_branches.name}`,
      payerEmail: tab.dunda_branches.email ?? undefined,
      payerPhone: tab.dunda_branches.phone ?? undefined,
      credentials,
    });

    await prisma.dunda_payment_attempts.update({
      where: { id: attempt.id },
      data: { reference: pesapalOrder.orderTrackingId },
    });

    await prisma.dunda_payment_provider_transactions.create({
      data: {
        organization_id: attempt.organization_id,
        kind: "CLUB_PAYMENT",
        provider: "PESAPAL",
        provider_transaction_id: pesapalOrder.orderTrackingId,
        reference: attempt.id,
        amount: attempt.amount,
        currency: attempt.currency,
        status: "INITIATED",
        request_payload: {
          attemptId: attempt.id,
          amount: attempt.amount,
          tabNumber: tab.number,
        },
        response_payload: pesapalOrder as any,
      },
    });

    return NextResponse.json({
      redirectUrl: pesapalOrder.redirectUrl,
      orderTrackingId: pesapalOrder.orderTrackingId,
      amount: attempt.amount,
    });
  },
);
