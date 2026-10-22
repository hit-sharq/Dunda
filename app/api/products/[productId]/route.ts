import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  baseUnit: z.string().optional(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  cost: z.number().int().min(0).optional(),
  price: z.number().int().min(0).optional(),
  tax: z.number().int().min(0).optional(),
  trackInventory: z.boolean().optional(),
  accent: z.string().optional(),
  active: z.boolean().optional(),
  available: z.boolean().optional(),
});

const PRODUCT_INCLUDE = {
  dunda_product_units: {
    select: {
      id: true,
      name: true,
      abbreviation: true,
      conversion_factor: true,
      selling_price: true,
      cost: true,
      whole_units_only: true,
      is_base_unit: true,
      sort_order: true,
    },
    orderBy: { sort_order: "asc" as const },
  },
};

function productShape(p: any) {
  return {
    id: p.id,
    name: p.name,
    categoryId: p.category_id,
    category: p.category,
    price: p.price,
    unit: p.unit,
    baseUnit: p.base_unit,
    stock: Number(p.stock ?? 0),
    available: p.available !== "false",
    active: p.active !== false,
    trackInventory: p.track_inventory !== false,
    accent: p.accent ?? "amber",
    sku: p.sku,
    barcode: p.barcode,
    cost: p.cost,
    tax: p.tax,
    description: p.description,
    dunda_product_units: (p.dunda_product_units ?? []).map((u: any) => ({
      id: u.id,
      productId: p.id,
      name: u.name,
      abbreviation: u.abbreviation,
      conversionFactor: Number(u.conversion_factor ?? 1),
      sellingPrice: u.selling_price,
      cost: u.cost,
      wholeUnitsOnly: u.whole_units_only !== false,
      isBaseUnit: u.is_base_unit === true,
      sortOrder: u.sort_order,
    })),
  };
}

export const GET = route(
  async (request: Request, context: { params: Promise<{ productId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    const { productId } = await context.params;

    const product = await prisma.dunda_products.findFirst({
      where: orgWhere(organizationId, { id: productId }),
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw notFound("That product");

    return NextResponse.json(productShape(product));
  },
);

export const PATCH = route(
  async (request: Request, context: { params: Promise<{ productId: string }> }) => {
    checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

    const session = await requirePermission("manage_products");
    const organizationId = session.organizationId as string;
    const { productId } = await context.params;

    const existing = await prisma.dunda_products.findFirst({
      where: orgWhere(organizationId, { id: productId }),
      select: { id: true, name: true, price: true, category_id: true },
    });
    if (!existing) throw notFound("That product");

    const input = await parseBody(updateProductSchema, request);

    // Changing a price is a separate permission from adding a product. A
    // manager who may add items cannot quietly reprice the menu.
    if (input.price !== undefined && input.price !== existing.price) {
      if (!session.permissions.has("manage_prices")) {
        throw wrongState("You need price rights to change what something costs.");
      }
    }

    let categoryName: string | undefined;
    if (input.categoryId && input.categoryId !== existing.category_id) {
      const category = await prisma.dunda_categories.findFirst({
        where: { id: input.categoryId, organization_id: organizationId },
        select: { name: true },
      });
      if (!category) throw notFound("That category");
      categoryName = category.name;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const product = await tx.dunda_products.update({
        where: { id: productId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
          ...(categoryName ?? input.category
            ? { category: categoryName ?? input.category }
            : {}),
          ...(input.baseUnit !== undefined ? { base_unit: input.baseUnit } : {}),
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.cost !== undefined ? { cost: input.cost } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(input.tax !== undefined ? { tax: input.tax } : {}),
          ...(input.trackInventory !== undefined
            ? { track_inventory: input.trackInventory }
            : {}),
          ...(input.accent !== undefined ? { accent: input.accent } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.available !== undefined
            ? { available: input.available ? "true" : "false" }
            : {}),
        },
        include: PRODUCT_INCLUDE,
      });

      // The base unit carries the price the menu shows. Keep them in step.
      if (input.price !== undefined) {
        await tx.dunda_product_units.updateMany({
          where: { product_id: productId, is_base_unit: true },
          data: { selling_price: input.price },
        });
      }

      await tx.dunda_audit_logs.create({
        data: {
          organization_id: organizationId,
          staff_id: session.staffId,
          action: "UPDATE",
          entity: "product",
          entity_id: productId,
          detail: `${product.name} updated`,
          previous_value: { name: existing.name, price: existing.price },
          new_value: { name: product.name, price: product.price },
        },
      });

      return product;
    });

    const full = await prisma.dunda_products.findUnique({
      where: { id: updated.id },
      include: PRODUCT_INCLUDE,
    });

    return NextResponse.json(productShape(full));
  },
);

export const DELETE = route(
  async (request: Request, context: { params: Promise<{ productId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("manage_products");
    const organizationId = session.organizationId as string;
    const { productId } = await context.params;

    const product = await prisma.dunda_products.findFirst({
      where: orgWhere(organizationId, { id: productId }),
      select: { id: true, name: true },
    });
    if (!product) throw notFound("That product");

    // A product that has been sold stays on the record. Take it off the menu
    // rather than deleting the history.
    const sold = await prisma.dunda_order_items.count({
      where: { product_id: productId },
    });

    if (sold > 0) {
      await prisma.dunda_products.update({
        where: { id: productId },
        data: { active: false, available: "false" },
      });

      await prisma.dunda_audit_logs.create({
        data: {
          organization_id: organizationId,
          staff_id: session.staffId,
          action: "DELETE",
          entity: "product",
          entity_id: productId,
          detail: `${product.name} taken off the menu (it has sales history)`,
          previous_value: { name: product.name },
          new_value: { active: false },
        },
      });

      return NextResponse.json({
        id: productId,
        status: "DEACTIVATED",
        reason: "This product has sales history, so it was taken off the menu rather than deleted.",
      });
    }

    await prisma.dunda_products.delete({ where: { id: productId } });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: session.staffId,
        action: "DELETE",
        entity: "product",
        entity_id: productId,
        detail: `${product.name} deleted from the menu`,
        previous_value: { name: product.name },
      },
    });

    return NextResponse.json({ id: productId, status: "DELETED" });
  },
);
