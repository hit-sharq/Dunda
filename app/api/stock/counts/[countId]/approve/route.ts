import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { adjustStock } from "@/lib/server/inventory";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Approves a stock count and writes the variance off against the shelf. The
 * adjustment goes through the normal stock movement ledger so the change is
 * traceable, not a silent overwrite of the product's stock.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ countId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("approve_transfer");
    const organizationId = session.organizationId as string;
    const { countId } = await context.params;

    const count = await prisma.dunda_stock_counts.findFirst({
      where: orgWhere(organizationId, { id: countId }),
      include: {
        dunda_stock_count_items: {
          select: { id: true, product_id: true, variance: true },
        },
      },
    });
    if (!count) throw notFound("That stock count");

    if (count.status !== "SUBMITTED") {
      throw wrongState(
        count.status === "APPROVED"
          ? "That count has already been approved."
          : "That count has not been submitted yet.",
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const item of count.dunda_stock_count_items) {
        const variance = Number(item.variance ?? 0);
        if (variance === 0) continue;
        await adjustStock(tx, {
          organizationId,
          branchId: count.branch_id,
          productId: item.product_id,
          quantity: variance,
          reason: `Stock count ${count.id} variance`,
          staffId: session.staffId,
          referenceId: count.id,
        });
      }

      await tx.dunda_stock_counts.update({
        where: { id: countId },
        data: { status: "APPROVED", approved_by_id: session.staffId },
      });

      await tx.dunda_audit_logs.create({
        data: {
          organization_id: organizationId,
          branch_id: count.branch_id,
          staff_id: session.staffId,
          action: "APPROVE",
          entity: "stock_count",
          entity_id: countId,
          detail: "Stock count approved and variances written off",
          previous_value: { status: "SUBMITTED" },
          new_value: { status: "APPROVED" },
        },
      });
    });

    return NextResponse.json({ id: countId, status: "APPROVED" });
  },
);
