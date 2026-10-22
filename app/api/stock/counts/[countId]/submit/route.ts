import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Submits a stock count for approval. Once submitted it can no longer be
 * edited, so what was counted is what gets approved.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ countId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("adjust_inventory");
    const organizationId = session.organizationId as string;
    const { countId } = await context.params;

    const count = await prisma.dunda_stock_counts.findFirst({
      where: orgWhere(organizationId, { id: countId }),
      select: { id: true, status: true, branch_id: true },
    });
    if (!count) throw notFound("That stock count");

    if (count.status !== "DRAFT") {
      throw wrongState(`That count is already ${count.status.toLowerCase()}.`);
    }

    const updated = await prisma.dunda_stock_counts.update({
      where: { id: countId },
      data: { status: "SUBMITTED" },
      select: { id: true, status: true },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: count.branch_id,
        staff_id: session.staffId,
        action: "UPDATE",
        entity: "stock_count",
        entity_id: countId,
        detail: "Stock count submitted for approval",
        previous_value: { status: count.status },
        new_value: { status: "SUBMITTED" },
      },
    });

    return NextResponse.json(updated);
  },
);
