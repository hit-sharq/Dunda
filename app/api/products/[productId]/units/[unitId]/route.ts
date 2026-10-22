import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const unitUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  abbreviation: z.string().min(1).optional(),
  conversionFactor: z.number().positive().optional(),
  isBaseUnit: z.boolean().optional(),
  sellingPrice: z.number().int().min(0).optional(),
  cost: z.number().int().min(0).nullable().optional(),
  wholeUnitsOnly: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ productId: string; unitId: string }> }) => {
    checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

    const session = await requirePermission("manage_products");
    const organizationId = session.organizationId as string;
    const { productId, unitId } = await context.params;

    const product = await prisma.dunda_products.findFirst({
      where: orgWhere(organizationId, { id: productId }),
      select: { id: true, name: true },
    });
    if (!product) throw notFound("That product");

    const unit = await prisma.dunda_product_units.findFirst({
      where: { id: unitId, product_id: productId },
      select: { id: true, name: true, selling_price: true, is_base_unit: true },
    });
    if (!unit) throw notFound("That unit");

    const input = await parseBody(unitUpdateSchema, request);

    if (
      input.sellingPrice !== undefined &&
      input.sellingPrice !== unit.selling_price &&
      !session.permissions.has("manage_prices")
    ) {
      throw wrongState("You need price rights to change what this unit costs.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.dunda_product_units.update({
        where: { id: unitId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.abbreviation !== undefined
            ? { abbreviation: input.abbreviation.slice(0, 8) }
            : {}),
          ...(input.conversionFactor !== undefined
            ? { conversion_factor: input.conversionFactor }
            : {}),
          ...(input.sellingPrice !== undefined
            ? { selling_price: input.sellingPrice }
            : {}),
          ...(input.cost !== undefined ? { cost: input.cost } : {}),
          ...(input.isBaseUnit !== undefined
            ? { is_base_unit: input.isBaseUnit }
            : {}),
          ...(input.wholeUnitsOnly !== undefined
            ? { whole_units_only: input.wholeUnitsOnly }
            : {}),
          ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
        },
      });

      if (input.isBaseUnit) {
        await tx.dunda_product_units.updateMany({
          where: { product_id: productId, id: { not: unitId } },
          data: { is_base_unit: false },
        });
      }

      // The menu shows the base unit price, so keep the product in step.
      if (row.is_base_unit && input.sellingPrice !== undefined) {
        await tx.dunda_products.update({
          where: { id: productId },
          data: { price: input.sellingPrice },
        });
      }

      await tx.dunda_audit_logs.create({
        data: {
          organization_id: organizationId,
          staff_id: session.staffId,
          action: "UPDATE",
          entity: "product_unit",
          entity_id: unitId,
          detail: `${row.name} on ${product.name} updated`,
          previous_value: { name: unit.name, sellingPrice: unit.selling_price },
          new_value: { name: row.name, sellingPrice: row.selling_price },
        },
      });

      return row;
    });

    return NextResponse.json({
      id: updated.id,
      productId,
      name: updated.name,
      abbreviation: updated.abbreviation,
      conversionFactor: Number(updated.conversion_factor ?? 1),
      sellingPrice: updated.selling_price,
      cost: updated.cost,
      wholeUnitsOnly: updated.whole_units_only !== false,
      isBaseUnit: updated.is_base_unit === true,
      sortOrder: updated.sort_order,
    });
  },
);

export const DELETE = route(
  async (request: Request, context: { params: Promise<{ productId: string; unitId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("manage_products");
    const organizationId = session.organizationId as string;
    const { productId, unitId } = await context.params;

    const product = await prisma.dunda_products.findFirst({
      where: orgWhere(organizationId, { id: productId }),
      select: { id: true, name: true },
    });
    if (!product) throw notFound("That product");

    const unit = await prisma.dunda_product_units.findFirst({
      where: { id: unitId, product_id: productId },
      select: { id: true, name: true, is_base_unit: true },
    });
    if (!unit) throw notFound("That unit");

    if (unit.is_base_unit) {
      const others = await prisma.dunda_product_units.count({
        where: { product_id: productId, id: { not: unitId } },
      });
      if (others === 0) {
        throw wrongState(
          "This is the only unit on the product. Add another one before removing this.",
        );
      }
    }

    const used = await prisma.dunda_order_items.count({
      where: { unit_id: unitId },
    });

    if (used > 0) {
      throw wrongState("That unit has been sold before, so it cannot be removed.");
    }

    await prisma.dunda_product_units.delete({ where: { id: unitId } });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: session.staffId,
        action: "DELETE",
        entity: "product_unit",
        entity_id: unitId,
        detail: `${unit.name} removed from ${product.name}`,
        previous_value: { name: unit.name },
      },
    });

    return NextResponse.json({ id: unitId, status: "DELETED" });
  },
);
