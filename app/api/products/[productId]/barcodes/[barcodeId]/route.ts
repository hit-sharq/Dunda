import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export const DELETE = route(
  async (request: Request, context: { params: Promise<{ productId: string; barcodeId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("manage_products");
    const organizationId = session.organizationId as string;
    const { productId, barcodeId } = await context.params;

    const product = await prisma.dunda_products.findFirst({
      where: orgWhere(organizationId, { id: productId }),
      select: { id: true, name: true },
    });
    if (!product) throw notFound("That product");

    const entry = await prisma.dunda_product_barcodes.findFirst({
      where: { id: barcodeId, product_id: productId },
      select: { id: true, barcode: true },
    });
    if (!entry) throw notFound("That barcode");

    await prisma.dunda_product_barcodes.delete({ where: { id: barcodeId } });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: session.staffId,
        action: "DELETE",
        entity: "product_barcode",
        entity_id: barcodeId,
        detail: `Barcode ${entry.barcode} removed from ${product.name}`,
        previous_value: { barcode: entry.barcode },
      },
    });

    return NextResponse.json({ id: barcodeId, status: "DELETED" });
  },
);
