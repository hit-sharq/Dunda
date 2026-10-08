import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession } from "@/lib/server/http";
import { checkoutTab } from "@/lib/server/tabs";
import {
  initiateClubPayment,
  isElectronicMethod,
} from "@/lib/server/payments";
import { checkoutSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

/**
 * Settles a tab.
 *
 * The amounts are checked against the tab's own stored total, so a caller cannot
 * declare the bill paid, and an idempotency key means a till that times out and is
 * pressed again does not take the money twice.
 *
 * Two ways to pay, because the money moves two ways. Cash is counted in the
 * drawer and settled here and now. Money that moves through a provider — M-Pesa,
 * a card — is initiated here and settled by the provider's own answer, so the
 * till never claims a payment the provider has not confirmed.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ tabId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { tabId } = await context.params;

    const body = await request.json().catch(() => ({}));
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: issue ? `${issue.path.join(".") || "payment"}: ${issue.message}` : "Invalid payment.",
          code: "VALIDATION_FAILED",
        },
        { status: 422 },
      );
    }

    const tab = await prisma.dunda_tabs.findFirst({
      where: { id: tabId, organization_id: organizationId },
      select: {
        branch_id: true,
        customer_id: true,
        total: true,
        dunda_payments: { select: { amount: true, status: true } },
      },
    });
    if (!tab) {
      return NextResponse.json(
        { error: "That tab no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const payments = parsed.data.payments;
    const electronic = payments.filter((p) => isElectronicMethod(p.method));
    const cash = payments.filter((p) => !isElectronicMethod(p.method));

    // The whole request is checked before anything moves, so a
    // split that overpays in total is refused in one piece
    // rather than half-settled.
    const alreadyPaid = tab.dunda_payments
      .filter((p) => p.status !== "VOIDED")
      .reduce((sum, p) => sum + p.amount, 0);
    const outstanding = Math.max(0, tab.total - alreadyPaid);
    const tendered = payments.reduce((sum, p) => sum + p.amount, 0);
    if (tendered > outstanding) {
      return NextResponse.json(
        {
          error: `That is more than the ${outstanding} still owed on this tab.`,
          code: "MONEY_RULE",
        },
        { status: 422 },
      );
    }

    // A bill paid from the drawer settles here and now.
    if (electronic.length === 0) {
      const result = await checkoutTab({
        organizationId,
        tabId,
        branchId: tab.branch_id,
        payments: cash,
        staffId: session.staffId,
        idempotencyKey: parsed.data.idempotencyKey ?? null,
      });
      return NextResponse.json(result);
    }

    // Any cash portion settles first, so the provider is only
    // asked for what is still owed once the drawer has paid.
    if (cash.length > 0) {
      await checkoutTab({
        organizationId,
        tabId,
        branchId: tab.branch_id,
        payments: cash,
        staffId: session.staffId,
        idempotencyKey: parsed.data.idempotencyKey
          ? `${parsed.data.idempotencyKey}#cash`
          : null,
      });
    }

    // The guest's contact details come from the tab's own
    // customer, so the provider can reach them without the
    // till typing them in at the counter.
    const customer = tab.customer_id
      ? await prisma.dunda_customers.findUnique({
          where: { id: tab.customer_id },
          select: { name: true, email: true, phone: true },
        })
      : null;

    const initiation = await initiateClubPayment({
      organizationId,
      branchId: tab.branch_id,
      tabId,
      amount: electronic.reduce((sum, p) => sum + p.amount, 0),
      method: electronic[0].method,
      staffId: session.staffId,
      payerEmail: customer?.email ?? null,
      payerPhone: customer?.phone ?? null,
      payerName: customer?.name ?? null,
    });

    return NextResponse.json({ status: "PENDING", ...initiation });
  },
);
