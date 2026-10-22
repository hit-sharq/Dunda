import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Looks a scanned barcode up so the till can ring the item without anyone
 * touching the screen.
 */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ barcode: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { barcode } = await context.params;

    const row = await prisma.dunda_product_barcodes.findFirst({
      where: { barcode },
      include: {
        dunda_products: {
          include: { dunda_product_units: { orderBy: { sort_order: "asc" } } },
        },
        dunda_product_units: true,
      },
    });

    if (!row) {
      return NextResponse.json(
        { error: `Nothing is filed under barcode ${barcode}.`, code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const product = row.dunda_products;
    if (product.organization_id !== organizationId) {
      return NextResponse.json(
        { error: `Nothing is filed under barcode ${barcode}.`, code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (!product.active) {
      return NextResponse.json(
        { error: `${product.name} is no longer sold.`, code: "NOT_AVAILABLE" },
        { status: 409 },
      );
    }

    const unit = row.dunda_product_units;

    return NextResponse.json({
      productId: product.id,
      name: product.name,
      category: product.category,
      baseUnit: product.base_unit,
      trackInventory: product.track_inventory !== false,
      active: product.active,
      stock: product.track_inventory ? Number(product.stock ?? 0) : null,
      stockUnit: product.track_inventory ? product.base_unit : null,
      sellingUnit: unit
        ? {
            id: unit.id,
            name: unit.name,
            abbreviation: unit.abbreviation,
            conversionFactor: Number(unit.conversion_factor ?? 1),
            sellingPrice: unit.selling_price,
            wholeUnitsOnly: unit.whole_units_only !== false,
          }
        : null,
    });
  },
);
