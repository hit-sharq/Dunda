import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Product categories, with how many sellable items each holds.
 *
 * The station decides which screen an order lands on: a drink on the bar, food on
 * the kitchen. It is stored per category so a new product inherits the routing
 * without being configured separately.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId");

  const categories = await prisma.dunda_categories.findMany({
    where: orgWhere(organizationId),
    orderBy: [{ sort_order: "asc" }, { name: "asc" }],
  });

  const counts = await Promise.all(
    categories.map(async (category) => {
      const products = await prisma.dunda_products.findMany({
        where: orgWhere(organizationId, {
          category_id: category.id,
          active: true,
          ...(branchId
            ? {
                dunda_product_branch_availability: {
                  some: { branch_id: branchId, available: true },
                },
              }
            : {}),
        }),
        select: { id: true, price: true, stock: true, track_inventory: true, available: true },
      });

      // Sellable means it can actually be rung up right now: active, marked
      // available, and not out of stock when it is tracked.
      const sellable = products.filter(
        (p) =>
          p.available === "true" &&
          (!p.track_inventory || Number(p.stock) > 0),
      );

      return {
        id: category.id,
        name: category.name,
        color: category.color,
        group: category.group,
        station: category.station,
        sortOrder: category.sort_order,
        productCount: products.length,
        sellableCount: sellable.length,
      };
    }),
  );

  return NextResponse.json(counts);
});
