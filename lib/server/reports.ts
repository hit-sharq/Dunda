import { prisma } from "@/lib/db/client";
import { orgWhere } from "./http";

export interface InventoryDiscrepancy {
  productId: string;
  name: string | null;
  variance: number;
  unit: string | null;
}

export interface InventoryReport {
  totalItems: number;
  stockValue: number;
  belowReorder: number;
  outOfStock: number;
  byMovement: Array<{ label: string; value: number }>;
  discrepancies: InventoryDiscrepancy[];
}

/**
 * Inventory position, movements and discrepancies.
 *
 * The position is a snapshot of what the shelves hold
 * right now, and the discrepancies are what the latest
 * approved stock count found at each branch. Both are
 * derived from the same rows the till and the storeroom
 * write, so the report cannot disagree with the stock
 * on hand.
 */
export async function getInventoryReport(
  organizationId: string,
  branchId?: string | null,
): Promise<InventoryReport> {
  const scope = orgWhere(organizationId, { branch_id: branchId ?? undefined });

  const [products, movements, approvedCounts] = await Promise.all([
    prisma.dunda_products.findMany({
      where: { ...scope, active: true, track_inventory: true },
      select: {
        id: true,
        cost: true,
        stock: true,
        minimum_stock: true,
      },
    }),
    prisma.dunda_stock_movements.groupBy({
      by: ["type"],
      where: scope,
      _sum: { quantity_in_base_unit: true },
    }),
    prisma.dunda_stock_counts.findMany({
      where: { ...scope, status: "APPROVED" },
      orderBy: { created_at: "desc" },
      select: { id: true, branch_id: true },
    }),
  ]);

  const totalItems = products.length;
  const stockValue = products.reduce(
    (sum, product) => sum + product.cost * Number(product.stock),
    0,
  );
  const belowReorder = products.filter(
    (product) => Number(product.stock) <= Number(product.minimum_stock),
  ).length;
  const outOfStock = products.filter((product) => Number(product.stock) === 0).length;

  const byMovement = movements.map((movement) => ({
    label: movement.type,
    value: Number(movement._sum.quantity_in_base_unit ?? 0),
  }));

  // The newest approved count per branch is the current
  // truth; older counts described stock that has since
  // moved, so their variances are history, not findings.
  const latestCountPerBranch = new Map<string, string>();
  for (const count of approvedCounts) {
    if (!latestCountPerBranch.has(count.branch_id)) {
      latestCountPerBranch.set(count.branch_id, count.id);
    }
  }
  const latestCountIds = [...latestCountPerBranch.values()];

  let discrepancies: InventoryDiscrepancy[] = [];
  if (latestCountIds.length > 0) {
    const items = await prisma.dunda_stock_count_items.findMany({
      where: { stock_count_id: { in: latestCountIds } },
      select: { product_id: true, variance: true },
    });
    const withVariance = items.filter(
      (item) => item.variance !== null && Number(item.variance) !== 0,
    );
    const productIds = [...new Set(withVariance.map((item) => item.product_id))];
    const productsNamed = await prisma.dunda_products.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, unit: true },
    });
    const productById = new Map(productsNamed.map((product) => [product.id, product]));
    discrepancies = withVariance.map((item) => {
      const product = productById.get(item.product_id);
      return {
        productId: item.product_id,
        name: product?.name ?? null,
        variance: Number(item.variance),
        unit: product?.unit ?? null,
      };
    });
  }

  return {
    totalItems,
    stockValue,
    belowReorder,
    outOfStock,
    byMovement,
    discrepancies,
  };
}
