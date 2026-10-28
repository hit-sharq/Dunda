import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requireSession, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const categoryInputSchema = z.object({
  name: z.string().min(1, "Give the category a name.").max(60),
  color: z.string().optional(),
  group: z.string().optional(),
  station: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

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

/**
 * Add a category to the club's menu.
 */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

  const session = await requirePermission("manage_products");
  const organizationId = session.organizationId as string;

  const input = await parseBody(categoryInputSchema, request);

  const created = await prisma.$transaction(async (tx) => {
    const category = await tx.dunda_categories.create({
      data: {
        organization_id: organizationId,
        name: input.name,
        color: input.color ?? "#6f9fb2",
        group: input.group ?? null,
        station: input.station ?? null,
        sort_order: input.sortOrder ?? 0,
      },
    });

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: session.staffId,
        action: "CREATE",
        entity: "category",
        entity_id: category.id,
        detail: `${input.name} added to the menu`,
        new_value: { name: input.name },
      },
    });

    return category;
  });

  return NextResponse.json({
    id: created.id,
    name: created.name,
    color: created.color,
    group: created.group,
    station: created.station,
    sortOrder: created.sort_order,
  }, { status: 201 });
});