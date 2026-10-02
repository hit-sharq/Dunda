import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requirePermission, orgWhere } from "@/lib/server/http";
import { adjustStock } from "@/lib/server/inventory";
import { adjustInventorySchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

/** Stock on hand, with what it is worth and what has run low. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const [items, alerts] = await Promise.all([
    prisma.dunda_inventory_items.findMany({
      where: orgWhere(organizationId, branchId ? { branch_id: branchId } : undefined),
      orderBy: { name: "asc" },
      take: 300,
      select: {
        id: true,
        product_id: true,
        name: true,
        category: true,
        sku: true,
        unit: true,
        current_quantity: true,
        reorder_level: true,
        cost: true,
      },
    }),
    prisma.dunda_inventory_alerts.findMany({
      where: orgWhere(organizationId, branchId ? { branch_id: branchId } : undefined),
      orderBy: { severity: "asc" },
      take: 50,
      select: {
        id: true,
        product_id: true,
        name: true,
        category: true,
        stock: true,
        minimum: true,
        unit: true,
        severity: true,
      },
    }),
  ]);

  const value = items.reduce((sum, item) => sum + Number(item.current_quantity) * item.cost, 0);

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.name,
      category: item.category,
      sku: item.sku,
      unit: item.unit,
      quantity: Number(item.current_quantity),
      reorderLevel: Number(item.reorder_level),
      cost: item.cost,
      value: Number(item.current_quantity) * item.cost,
    })),
    alerts: alerts.map((a) => ({
      id: a.id,
      productId: a.product_id,
      name: a.name,
      category: a.category,
      stock: Number(a.stock),
      minimum: Number(a.minimum),
      unit: a.unit,
      severity: a.severity,
    })),
    totalValue: value,
    lowStock: alerts.filter((a) => a.severity === "LOW").length,
    outOfStock: alerts.filter((a) => a.severity === "OUT").length,
  });
});

/**
 * A manager's adjustment: stock count correction, breakage, a theft write-off.
 *
 * Always writes a movement and always requires a reason. Editing the quantity
 * directly would leave the shelf and the movement history disagreeing with no
 * record of which happened.
 */
export const POST = route(async (request: Request) => {
  const session = await requirePermission("adjust_inventory");
  const organizationId = session.organizationId as string;

  const body = await request.json().catch(() => ({}));
  const parsed = adjustInventorySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue ? `${issue.path.join(".") || "adjustment"}: ${issue.message}` : "Invalid adjustment.",
        code: "VALIDATION_FAILED",
      },
      { status: 422 },
    );
  }

  // A product is a catalog entry; stock lives on the branch's inventory rows, so
  // the adjustment is written against the caller's branch rather than the product.
  const product = await prisma.dunda_products.findFirst({
    where: orgWhere(organizationId, { id: parsed.data.productId }),
    select: { id: true, name: true },
  });
  if (!product) {
    return NextResponse.json(
      { error: "That product no longer exists.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const branchId = session.branchId;
  if (!branchId) {
    return NextResponse.json(
      { error: "Choose a branch first.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const delta = await prisma.$transaction(async (tx) =>
    adjustStock(tx, {
      organizationId,
      branchId,
      productId: product.id,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      staffId: session.staffId,
    }),
  );

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: branchId,
      staff_id: session.staffId,
      action: "ADJUST",
      entity: "inventory_item",
      entity_id: product.id,
      detail: `${product.name} adjusted by ${delta > 0 ? "+" : ""}${delta}`,
      reason: parsed.data.reason,
      new_value: { delta },
    },
  });

  const updated = await prisma.dunda_inventory_items.findFirst({
    where: orgWhere(organizationId, { product_id: product.id, branch_id: branchId }),
    select: { current_quantity: true },
  });

  return NextResponse.json({
    productId: product.id,
    delta,
    quantity: Number(updated?.current_quantity ?? 0),
  });
});
