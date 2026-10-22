import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const stockCountSchema = z.object({
  branchId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        actualQuantity: z.number().min(0),
      }),
    )
    .min(1, "A stock count needs at least one line."),
});

function countShape(c: any) {
  return {
    id: c.id,
    organizationId: c.organization_id,
    branchId: c.branch_id,
    status: c.status,
    notes: c.notes,
    countedById: c.counted_by_id,
    approvedById: c.approved_by_id,
    createdAt: c.created_at.toISOString(),
    items: (c.dunda_stock_count_items ?? []).map((i: any) => ({
      id: i.id,
      productId: i.product_id,
      expectedQuantity: Number(i.expected_quantity ?? 0),
      actualQuantity: i.actual_quantity === null ? null : Number(i.actual_quantity),
      variance: i.variance === null ? null : Number(i.variance),
    })),
  };
}

const COUNT_INCLUDE = {
  dunda_stock_count_items: {
    select: {
      id: true,
      product_id: true,
      expected_quantity: true,
      actual_quantity: true,
      variance: true,
    },
  },
};

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const status = url.searchParams.get("status");

  const counts = await prisma.dunda_stock_counts.findMany({
    where: orgWhere(organizationId, {
      ...(branchId ? { branch_id: branchId } : {}),
      ...(status ? { status } : {}),
    }),
    orderBy: { created_at: "desc" },
    include: COUNT_INCLUDE,
  });

  return NextResponse.json(counts.map(countShape));
});

/**
 * Opens a stock count. The expected quantity is snapshotted from what the
 * system believes is on the shelf, so the variance later is against a fixed
 * number rather than a moving target.
 */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

  const session = await requirePermission("adjust_inventory");
  const organizationId = session.organizationId as string;

  const input = await parseBody(stockCountSchema, request);
  const branchId = input.branchId ?? session.branchId;
  if (!branchId) {
    return NextResponse.json(
      { error: "Which branch is being counted?", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const branch = await prisma.dunda_branches.findFirst({
    where: orgWhere(organizationId, { id: branchId }),
    select: { id: true, name: true },
  });
  if (!branch) throw notFound("That branch");

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.dunda_products.findMany({
    where: { id: { in: productIds }, organization_id: organizationId },
    select: { id: true, name: true, stock: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const missing = productIds.filter((id) => !byId.has(id));
  if (missing.length) {
    return NextResponse.json(
      { error: "Some of those products are not in this club.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const count = await tx.dunda_stock_counts.create({
      data: {
        organization_id: organizationId,
        branch_id: branch.id,
        status: "DRAFT",
        notes: input.notes ?? null,
        counted_by_id: session.staffId,
      },
    });

    for (const item of input.items) {
      const product = byId.get(item.productId)!;
      const expected = Number(product.stock ?? 0);
      const actual = item.actualQuantity;
      await tx.dunda_stock_count_items.create({
        data: {
          stock_count_id: count.id,
          product_id: product.id,
          expected_quantity: expected,
          actual_quantity: actual,
          variance: actual - expected,
        },
      });
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: branch.id,
        staff_id: session.staffId,
        action: "CREATE",
        entity: "stock_count",
        entity_id: count.id,
        detail: `Stock count opened at ${branch.name} with ${input.items.length} line(s)`,
      },
    });

    return count;
  });

  const full = await prisma.dunda_stock_counts.findUnique({
    where: { id: created.id },
    include: COUNT_INCLUDE,
  });

  return NextResponse.json(countShape(full), { status: 201 });
});
