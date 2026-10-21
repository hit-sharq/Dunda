import { NextResponse } from "next/server";
import { z } from "zod";
import { route, requirePermission, parseBody } from "@/lib/server/http";
import { approveRefund } from "@/lib/server/payments";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  approve: z.boolean(),
  notes: z.string().nullable().optional(),
});

/**
 * Releases or rejects a refund that was held because it was above the
 * approval limit. The manager who approves is the one who moves the money.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ refundId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("approve_refunds");
    const organizationId = session.organizationId as string;
    const { refundId } = await context.params;

    const input = await parseBody(decisionSchema, request);

    const result = await approveRefund({
      organizationId,
      refundId,
      staffId: session.staffId,
      staffName: session.roleName ?? "Manager",
      approve: input.approve,
      notes: input.notes ?? null,
    });

    return NextResponse.json(result);
  },
);
