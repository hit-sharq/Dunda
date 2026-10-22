import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const barcodeSchema = z.object({
  barcode: z.string().min(1, "Scan or type the barcode."),
  unitId: z.string().min(1, "Which unit does this barcode sell?"),
});

/**
 * Binds a scanned barcode to a selling unit, so the till can ring an item by
 * pointing a scanner at it.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ productId: string }> }) => {
    checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

    const session = await requirePermission("manage_products");
    const organizationId = session.organizationId as string;
    const { productId } = await context.params;

    const product = await prisma.dunda_products.findFirst({
      where: orgWhere(organizationId, { id: productId }),
      select: { id: true, name: true },
    });
    if (!product) throw notFound("That product");

    const input = await parseBody(barcodeSchema, request);

    const unit = await prisma.dunda_product_units.findFirst({
      where: { id: input.unitId, product_id: productId },
      select: { id: true, name: true },
    });
    if (!unit) throw notFound("That unit");

    const clash = await prisma.dunda_product_barcodes.findUnique({
      where: { barcode: input.barcode },
      select: { id: true, product_id: true, unit_id: true },
    });
    if (clash) {
      return NextResponse.json(
        {
          error: "That barcode is already on the menu.",
          code: "DUPLICATE_BARCODE",
        },
        { status: 409 },
      );
    }

    const created = await prisma.dunda_product_barcodes.create({
      data: {
        product_id: productId,
        barcode: input.barcode,
        unit_id: unit.id,
      },
      select: { id: true, product_id: true, barcode: true, unit_id: true },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: session.staffId,
        action: "CREATE",
        entity: "product_barcode",
        entity_id: created.id,
        detail: `Barcode ${input.barcode} bound to ${product.name} (${unit.name})`,
        new_value: { barcode: input.barcode, unitId: unit.id },
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        productId: created.product_id,
        barcode: created.barcode,
        unitId: created.unit_id,
      },
      { status: 201 },
    );
  },
);
