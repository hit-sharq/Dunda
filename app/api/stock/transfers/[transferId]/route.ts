import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { adjustStock } from "@/lib/server/inventory";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const updateTransferSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "IN_TRANSIT", "COMPLETED"]).optional(),
  notes: z.string().nullable().optional(),
});

export const GET = route(
  async (request: Request, context: { params: Promise<{ transferId: string }> }) => {
    const session = await requirePermission("view_inventory");
    const organizationId = session.organizationId as string;
    const { transferId } = await context.params;

    const transfer = await prisma.dunda_stock_transfers.findFirst({
      where: orgWhere(organizationId, { id: transferId }),
      include: {
        dunda_stock_transfer_items: {
          select: {
            id: true,
            product_id: true,
            quantity: true,
            quantity_in_base_unit: true,
          },
        },
      },
    });
    if (!transfer) throw notFound("That transfer");

    return NextResponse.json({
      id: transfer.id,
      organizationId: transfer.organization_id,
      sourceBranchId: transfer.source_branch_id,
      destinationBranchId: transfer.destination_branch_id,
      status: transfer.status,
      notes: transfer.notes,
      approvedById: transfer.approved_by_id,
      createdAt: transfer.created_at.toISOString(),
      items: transfer.dunda_stock_transfer_items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        quantity: Number(i.quantity ?? 0),
        quantityInBaseUnit: Number(i.quantity_in_base_unit ?? 0),
      })),
    });
  },
);

/**
 * Approving a transfer takes the stock off the source shelf and puts it on
 * the destination shelf, through the movement ledger so both sides are
 * traceable.
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ transferId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("approve_transfer");
    const organizationId = session.organizationId as string;
    const { transferId } = await context.params;

    const transfer = await prisma.dunda_stock_transfers.findFirst({
      where: orgWhere(organizationId, { id: transferId }),
      include: {
        dunda_stock_transfer_items: {
          select: { id: true, product_id: true, quantity_in_base_unit: true },
        },
      },
    });
    if (!transfer) throw notFound("That transfer");

    const input = await parseBody(updateTransferSchema, request);

    if (!input.status) {
      const updated = await prisma.dunda_stock_transfers.update({
        where: { id: transferId },
        data: { notes: input.notes ?? undefined },
        select: { id: true, status: true, notes: true },
      });
      return NextResponse.json(updated);
    }

    if (input.status === "REJECTED") {
      if (transfer.status !== "DRAFT") {
        throw wrongState("That transfer has already left the draft.");
      }
      const updated = await prisma.dunda_stock_transfers.update({
        where: { id: transferId },
        data: { status: "REJECTED", approved_by_id: session.staffId },
        select: { id: true, status: true },
      });
      return NextResponse.json(updated);
    }

    if (input.status === "APPROVED") {
      if (transfer.status !== "DRAFT") {
        throw wrongState("That transfer has already been approved.");
      }

      await prisma.$transaction(async (tx) => {
        for (const item of transfer.dunda_stock_transfer_items) {
          const quantity = Number(item.quantity_in_base_unit ?? 0);
          if (quantity === 0) continue;

          await adjustStock(tx, {
            organizationId,
            branchId: transfer.source_branch_id,
            productId: item.product_id,
            quantity: -quantity,
            reason: `Transfer ${transfer.id} out`,
            staffId: session.staffId,
            referenceId: transfer.id,
          });

          await adjustStock(tx, {
            organizationId,
            branchId: transfer.destination_branch_id,
            productId: item.product_id,
            quantity,
            reason: `Transfer ${transfer.id} in`,
            staffId: session.staffId,
            referenceId: transfer.id,
          });
        }

        await tx.dunda_stock_transfers.update({
          where: { id: transferId },
          data: { status: "APPROVED", approved_by_id: session.staffId },
        });
      });

      return NextResponse.json({ id: transferId, status: "APPROVED" });
    }

    const updated = await prisma.dunda_stock_transfers.update({
      where: { id: transferId },
      data: { status: input.status },
      select: { id: true, status: true },
    });

    return NextResponse.json(updated);
  },
);
