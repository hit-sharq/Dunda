import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const collectSchema = z.object({
  method: z
    .enum(["CASH", "MPESA", "CARD", "BANK_TRANSFER", "OTHER"])
    .default("MPESA"),
});

/**
 * The waiter taps a table to bring the payment QR. We create a payment attempt
 * for the tab's outstanding balance and hand back a short link the waiter can
 * turn into a QR code. The customer scans it and pays without an account.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ tabId: string }> }) => {
    checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { tabId } = await context.params;

    const body = await parseBody(collectSchema, request);

    const tab = await prisma.dunda_tabs.findFirst({
      where: orgWhere(organizationId, { id: tabId }),
      include: {
        dunda_payments: { select: { id: true, amount: true, status: true } },
        dunda_branches: { select: { name: true } },
      },
    });
    if (!tab) throw notFound("That tab");

    if (tab.status === "SETTLED" || tab.status === "CLOSED") {
      throw wrongState("That tab is already settled.");
    }

    const paid = tab.dunda_payments
      .filter((p) => p.status !== "VOIDED")
      .reduce((sum, p) => sum + p.amount, 0);
    const outstanding = Math.max(0, tab.total - paid);

    if (outstanding <= 0) {
      throw wrongState("That tab has nothing left to pay.");
    }

    const method = body.method;

    // Reuse an attempt that is still waiting for the customer so the waiter
    // does not spam new rows every time they tap.
    const existing = await prisma.dunda_payment_attempts.findFirst({
      where: { organization_id: organizationId, tab_id: tab.id, status: "INITIATED" },
      orderBy: { requested_at: "desc" },
      select: { id: true, amount: true, method: true },
    });

    if (existing) {
      return NextResponse.json({
        attemptId: existing.id,
        amount: existing.amount,
        method: existing.method,
        outstanding,
        payUrl: `/pay/${existing.id}`,
      });
    }

    const attempt = await prisma.dunda_payment_attempts.create({
      data: {
        organization_id: organizationId,
        branch_id: tab.branch_id,
        tab_id: tab.id,
        amount: outstanding,
        currency: "KES",
        method,
        provider: "PESAPAL",
        status: "INITIATED",
      },
      select: { id: true, amount: true, method: true },
    });

    return NextResponse.json(
      {
        attemptId: attempt.id,
        amount: attempt.amount,
        method: attempt.method,
        outstanding,
        payUrl: `/pay/${attempt.id}`,
      },
      { status: 201 },
    );
  },
);
