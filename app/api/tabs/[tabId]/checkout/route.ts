import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession } from "@/lib/server/http";
import { checkoutTab } from "@/lib/server/tabs";
import { checkoutSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

/**
 * Settles a tab.
 *
 * The amounts are checked against the tab's own stored total, so a caller cannot
 * declare the bill paid, and an idempotency key means a till that times out and is
 * pressed again does not take the money twice.
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
      select: { branch_id: true },
    });
    if (!tab) {
      return NextResponse.json(
        { error: "That tab no longer exists.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const result = await checkoutTab({
      organizationId,
      tabId,
      branchId: tab.branch_id,
      payments: parsed.data.payments,
      staffId: session.staffId,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
    });

    return NextResponse.json(result);
  },
);
