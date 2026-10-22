import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const transferSchema = z.object({
  sourceBranchId: z.string().min(1),
  destinationBranchId: z.string().min(1),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive("A transfer moves something."),
        unitId: z.string().nullable().optional(),
      }),
    )
    .min(1, "A transfer needs at least one line."),
});

function transferShape(t: any) {
  return {
    id: t.id,
    organizationId: t.organization_id,
    sourceBranchId: t.source_branch_id,
    destinationBranchId: t.destination_branch_id,
    status: t.status,
    notes: t.notes,
    approvedById: t.approved_by_id,
    createdAt: t.created_at.toISOString(),
    items: (t.dunda_stock_transfer_items ?? []).map((i: any) => ({
      id: i.id,
      productId: i.product_id,
      quantity: Number(i.quantity ?? 0),
      quantityInBaseUnit: Number(i.quantity_in_base_unit ?? 0),
    })),
  };
}

const TRANSFER_INCLUDE = {
  dunda_stock_transfer_items: {
    select: {
      id: true,
      product_id: true,
      quantity: true,
      quantity_in_base_unit: true,
    },
  },
};

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const transfers = await prisma.dunda_stock_transfers.findMany({
    where: orgWhere(organizationId, status ? { status } : {}),
    orderBy: { created_at: "desc" },
    include: TRANSFER_INCLUDE,
  });

  return NextResponse.json(transfers.map(transferShape));
});

/**
 * Moves stock from one branch to another. The quantity is converted into the
 * product's base unit so the shelf numbers stay comparable.
 */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

  const session = await requirePermission("approve_transfer");
  const organizationId = session.organizationId as string;

  const input = await parseBody(transferSchema, request);

  if (input.sourceBranchId === input.destinationBranchId) {
    return NextResponse.json(
      { error: "A transfer needs two different branches.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const branches = await prisma.dunda_branches.findMany({
    where: orgWhere(organizationId, { id: { in: [input.sourceBranchId, input.destinationBranchId] } }),
    select: { id: true, name: true },
  });
  if (branches.length !== 2) throw notFound("One of those branches");

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.dunda_products.findMany({
    where: { id: { in: productIds }, organization_id: organizationId },
    select: {
      id: true,
      name: true,
      dunda_product_units: {
        select: { id: true, is_base_unit: true, conversion_factor: true },
      },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Convert each line into the product's base unit so the shelf numbers
  // stay comparable across products sold in different units.
  const baseQuantities = new Map<string, number>();
  for (const item of input.items) {
    const product = byId.get(item.productId);
    if (!product) throw notFound("One of those products");

    const unit = item.unitId
      ? product.dunda_product_units.find((u) => u.id === item.unitId)
      : product.dunda_product_units.find((u) => u.is_base_unit);
    const factor = Number(unit?.conversion_factor ?? 1);
    baseQuantities.set(item.productId, item.quantity * factor);
  }

  const created = await prisma.$transaction(async (tx) => {
    const transfer = await tx.dunda_stock_transfers.create({
      data: {
        organization_id: organizationId,
        source_branch_id: input.sourceBranchId,
        destination_branch_id: input.destinationBranchId,
        status: "DRAFT",
        notes: input.notes ?? null,
      },
    });

    for (const item of input.items) {
      await tx.dunda_stock_transfer_items.create({
        data: {
          transfer_id: transfer.id,
          product_id: item.productId,
          quantity: item.quantity,
          quantity_in_base_unit: baseQuantities.get(item.productId) ?? item.quantity,
        },
      });
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: input.sourceBranchId,
        staff_id: session.staffId,
        action: "CREATE",
        entity: "stock_transfer",
        entity_id: transfer.id,
        detail: `Transfer of ${input.items.length} line(s) raised`,
      },
    });

    return transfer;
  });

  const full = await prisma.dunda_stock_transfers.findUnique({
    where: { id: created.id },
    include: TRANSFER_INCLUDE,
  });

  return NextResponse.json(transferShape(full), { status: 201 });
});
