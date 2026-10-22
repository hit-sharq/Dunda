import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const productInputSchema = z.object({
  name: z.string().min(1, "Give the product a name."),
  categoryId: z.string().min(1, "Pick a category."),
  category: z.string().min(1, "Pick a category."),
  baseUnit: z.string().optional(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  cost: z.number().int().min(0).optional(),
  price: z.number().int().min(0, "A price cannot be negative."),
  tax: z.number().int().min(0).optional(),
  trackInventory: z.boolean().optional(),
  accent: z.string().optional(),
});

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

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const categoryId = url.searchParams.get("category_id") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const active = url.searchParams.get("active") !== "false";

  const products = await prisma.dunda_products.findMany({
    where: {
      ...orgWhere(organizationId),
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(active ? { active: true } : {}),
    },
    include: PRODUCT_INCLUDE,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(products.map(productShape));
});

/**
 * Adds a product to the club's menu. The base unit is created with it so the
 * product is sellable the moment it is saved.
 */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

  const session = await requirePermission("manage_products");
  const organizationId = session.organizationId as string;

  const input = await parseBody(productInputSchema, request);

  const category = await prisma.dunda_categories.findFirst({
    where: { id: input.categoryId, organization_id: organizationId },
    select: { id: true, name: true },
  });
  if (!category) {
    return NextResponse.json(
      { error: "That category is not in this club.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const product = await tx.dunda_products.create({
      data: {
        organization_id: organizationId,
        category_id: category.id,
        name: input.name,
        category: category.name,
        unit: input.baseUnit ?? "piece",
        base_unit: input.baseUnit ?? "piece",
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        description: input.description ?? null,
        cost: input.cost ?? 0,
        price: input.price,
        tax: input.tax ?? 0,
        track_inventory: input.trackInventory ?? true,
        accent: input.accent ?? "amber",
        active: true,
        available: "true",
        stock: 0,
      },
    });

    await tx.dunda_product_units.create({
      data: {
        product_id: product.id,
        name: input.baseUnit ?? "piece",
        abbreviation: (input.baseUnit ?? "piece").slice(0, 4),
        conversion_factor: 1,
        selling_price: input.price,
        cost: input.cost ?? 0,
        is_base_unit: true,
        whole_units_only: false,
        sort_order: 0,
      },
    });

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: session.staffId,
        action: "CREATE",
        entity: "product",
        entity_id: product.id,
        detail: `${input.name} added to the menu at ${input.price}`,
        new_value: { name: input.name, price: input.price },
      },
    });

    return product;
  });

  const full = await prisma.dunda_products.findUnique({
    where: { id: created.id },
    include: PRODUCT_INCLUDE,
  });

  return NextResponse.json(productShape(full), { status: 201 });
});
