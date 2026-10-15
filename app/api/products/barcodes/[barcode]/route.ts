import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";


export const GET = route(async (_request: Request, context: { params: Promise<{ barcode: string }> }) => {
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

  return NextResponse.json({
    productId: product.id,
    name: product.name,
    category: product.category,
    
    price: row.dunda_product_units.selling_price,
    unitId: row.unit_id,
    unitName: row.dunda_product_units.name,
    conversionFactor: Number(row.dunda_product_units.conversion_factor),
    stock: Number(product.stock),
    trackInventory: product.track_inventory,
    tax: product.tax,
    available: product.available === "true",
  });
});