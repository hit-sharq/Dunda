import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const unitInputSchema = z.object({
  name: z.string().min(1, "Give the unit a name."),
  abbreviation: z.string().min(1, "Give it a short label."),
  conversionFactor: z.number().positive("A conversion factor must be above zero."),
  isBaseUnit: z.boolean().optional(),
  sellingPrice: z.number().int().min(0, "A price cannot be negative."),
  cost: z.number().int().min(0).nullable().optional(),
  wholeUnitsOnly: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

function unitShape(u: any, productId: string) {
  return {
    id: u.id,
    productId,
    name: u.name,
    abbreviation: u.abbreviation,
    conversionFactor: Number(u.conversion_factor ?? 1),
    sellingPrice: u.selling_price,
    cost: u.cost,
    wholeUnitsOnly: u.whole_units_only !== false,
    isBaseUnit: u.is_base_unit === true,
    sortOrder: u.sort_order,
  };
}

export const GET = route(
  async (request: Request, context: { params: Promise<{ productId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { productId } = await context.params;

    const product = await prisma.dunda_products.findFirst({
      where: orgWhere(organizationId, { id: productId }),
      select: { id: true },
    });
    if (!product) throw notFound("That product");

    const units = await prisma.dunda_product_units.findMany({
      where: { product_id: productId },
      orderBy: { sort_order: "asc" },
    });

    return NextResponse.json(units.map((u) => unitShape(u, productId)));
  },
);

/**
 * Adds a selling unit to a product: a bottle and a glass, a kilo and a
 * half kilo. Each carries its own price.
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

    const input = await parseBody(unitInputSchema, request);

    if (input.sellingPrice > 0 && !session.permissions.has("manage_prices")) {
      return NextResponse.json(
        {
          error: "You need price rights to add a unit that costs something.",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const unit = await tx.dunda_product_units.create({
        data: {
          product_id: productId,
          name: input.name,
          abbreviation: input.abbreviation.slice(0, 8),
          conversion_factor: input.conversionFactor,
          selling_price: input.sellingPrice,
          cost: input.cost ?? null,
          is_base_unit: input.isBaseUnit ?? false,
          whole_units_only: input.wholeUnitsOnly ?? false,
          sort_order: input.sortOrder ?? 0,
        },
      });

      // Only one base unit per product. If this one is the base, demote the
      // others so the menu price stays unambiguous.
      if (input.isBaseUnit) {
        await tx.dunda_product_units.updateMany({
          where: { product_id: productId, id: { not: unit.id } },
          data: { is_base_unit: false },
        });
      }

      await tx.dunda_audit_logs.create({
        data: {
          organization_id: organizationId,
          staff_id: session.staffId,
          action: "CREATE",
          entity: "product_unit",
          entity_id: unit.id,
          detail: `${input.name} added to ${product.name} at ${input.sellingPrice}`,
          new_value: { name: input.name, sellingPrice: input.sellingPrice },
        },
      });

      return unit;
    });

    return NextResponse.json(unitShape(created, productId), { status: 201 });
  },
);
