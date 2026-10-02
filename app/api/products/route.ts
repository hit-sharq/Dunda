import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** The catalog, searchable and filterable by category, for the till and the back office. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);

  const search = url.searchParams.get("search")?.trim();
  const categoryId = url.searchParams.get("categoryId");
  const activeOnly = url.searchParams.get("active") !== "false";

  // Assembled rather than spread so the search clause keeps Prisma's own type
  // instead of widening into an unassignable object.
  const where: Prisma.dunda_productsWhereInput = {
    organization_id: organizationId,
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(activeOnly ? { active: true } : {}),
  };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { barcode: { contains: search, mode: "insensitive" } },
    ];
  }

  const products = await prisma.dunda_products.findMany({
    where,
    orderBy: { name: "asc" },
    take: 300,
    include: {
      dunda_product_units: { orderBy: { sort_order: "asc" } },
      dunda_product_barcodes: { select: { barcode: true } },
    },
  });

  return NextResponse.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      categoryId: p.category_id,
      category: p.category,
      price: p.price,
      unit: p.unit,
      baseUnit: p.base_unit,
      stock: Number(p.stock),
      available: p.available === "true",
      active: p.active,
      trackInventory: p.track_inventory,
      accent: p.accent,
      sku: p.sku,
      barcode: p.barcode ?? p.dunda_product_barcodes[0]?.barcode ?? null,
      cost: p.cost,
      tax: p.tax,
      description: p.description,
      units: p.dunda_product_units.map((u) => ({
        id: u.id,
        productId: u.product_id,
        name: u.name,
        abbreviation: u.abbreviation,
        conversionFactor: Number(u.conversion_factor),
        sellingPrice: u.selling_price,
        cost: u.cost,
        wholeUnitsOnly: u.whole_units_only,
        isBaseUnit: u.is_base_unit,
      })),
    })),
  );
});
