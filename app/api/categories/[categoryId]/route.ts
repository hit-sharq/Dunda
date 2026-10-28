import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
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

/**
 * Update a category (name, color, sort order).
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ categoryId: string }> }) => {
    checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

    const session = await requirePermission("manage_products");
    const organizationId = session.organizationId as string;
    const { categoryId } = await context.params;

    const existing = await prisma.dunda_categories.findFirst({
      where: orgWhere(organizationId, { id: categoryId }),
      select: { id: true, name: true },
    });
    if (!existing) throw notFound("That category");

    const input = await parseBody(categoryInputSchema, request);

    const updated = await prisma.$transaction(async (tx) => {
      const category = await tx.dunda_categories.update({
        where: { id: categoryId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.group !== undefined ? { group: input.group } : {}),
          ...(input.station !== undefined ? { station: input.station } : {}),
          ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
        },
      });

      await tx.dunda_audit_logs.create({
        data: {
          organization_id: organizationId,
          staff_id: session.staffId,
          action: "UPDATE",
          entity: "category",
          entity_id: category.id,
          detail: `${category.name} updated`,
          previous_value: { name: existing.name },
          new_value: { name: category.name },
        },
      });

      return category;
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      color: updated.color,
      group: updated.group,
      station: updated.station,
      sortOrder: updated.sort_order,
    });
  },
);

/**
 * Remove a category. Only allowed when no products still use it.
 */
export const DELETE = route(
  async (request: Request, context: { params: Promise<{ categoryId: string }> }) => {
    checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

    const session = await requirePermission("manage_products");
    const organizationId = session.organizationId as string;
    const { categoryId } = await context.params;

    const category = await prisma.dunda_categories.findFirst({
      where: orgWhere(organizationId, { id: categoryId }),
      select: { id: true, name: true },
    });
    if (!category) throw notFound("That category");

    const usedBy = await prisma.dunda_products.count({
      where: { category_id: categoryId },
    });

    if (usedBy > 0) {
      return NextResponse.json({
        id: categoryId,
        status: "REFUSED",
        reason: `Still used by ${usedBy} product(s). Take them off the menu first.`,
      }, { status: 422 });
    }

    await prisma.dunda_categories.delete({ where: { id: categoryId } });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        staff_id: session.staffId,
        action: "DELETE",
        entity: "category",
        entity_id: categoryId,
        detail: `${category.name} removed from the menu`,
        previous_value: { name: category.name },
      },
    });

    return NextResponse.json({ id: categoryId, status: "DELETED" });
  },
);
