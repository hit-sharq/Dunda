import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(
  async (request: Request, context: { params: Promise<{ tableId: string }> }) => {
    const { tableId } = await context.params;

    const table = await prisma.dunda_tables.findUnique({
      where: { id: tableId },
      select: {
        id: true,
        name: true,
        branch_id: true,
        dunda_branches: {
          select: {
            id: true,
            name: true,
            dunda_organizations: { select: { id: true, name: true, status: true, currency: true } },
          },
        },
      },
    });

    if (!table) {
      return NextResponse.json(
        { error: "That table is not on our floor plan.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (table.dunda_branches.dunda_organizations.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This club is not currently serving.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const products = await prisma.dunda_products.findMany({
      where: {
        organization_id: table.dunda_branches.dunda_organizations.id,
        active: true,
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        image: true,
        description: true,
        dunda_product_units: {
          select: {
            id: true,
            name: true,
            selling_price: true,
            is_base_unit: true,
          },
          orderBy: { is_base_unit: "desc" },
        },
      },
    });

    const categories = [...new Set(products.map((p) => p.category))];

    return NextResponse.json({
      table: {
        id: table.id,
        name: table.name,
        branch: table.dunda_branches.name,
        club: table.dunda_branches.dunda_organizations.name,
        currency: table.dunda_branches.dunda_organizations.currency,
      },
      categories,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        image: p.image,
        description: p.description,
        units: p.dunda_product_units.map((u) => ({
          id: u.id,
          name: u.name,
          price: u.selling_price,
          isBase: u.is_base_unit,
        })),
      })),
    });
  },
);
