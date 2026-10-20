import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Public menu for a club. Scoped to one organization so a customer can never
 * see another club's products. Branch availability and branch price overrides
 * are honoured when a branch is supplied.
 */
export const GET = route(
  async (request: Request, context: { params: Promise<{ slug: string }> }) => {
    const { slug } = await context.params;
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId");

    const org = await prisma.dunda_organizations.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        status: true,
        dunda_branches: {
          where: { status: { in: ["LIVE", "ACTIVE"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, city: true, address: true, phone: true },
        },
      },
    });

    if (!org) {
      return NextResponse.json(
        { error: "We could not find that club.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (org.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This club is not currently serving.", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const branch = branchId
      ? org.dunda_branches.find((b) => b.id === branchId)
      : undefined;
    if (branchId && !branch) {
      return NextResponse.json(
        { error: "That location is not open right now.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const products = await prisma.dunda_products.findMany({
      where: { organization_id: org.id, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        image: true,
        description: true,
        dunda_product_branch_availability: branch
          ? {
              where: { branch_id: branch.id },
              select: { price: true, available: true },
            }
          : { where: { branch_id: "__none__" }, select: { price: true, available: true } },
        dunda_product_units: {
          select: { id: true, name: true, selling_price: true, is_base_unit: true },
          orderBy: { is_base_unit: "desc" },
        },
      },
    });

    const categories = [...new Set(products.map((p) => p.category))];

    return NextResponse.json({
      club: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        currency: org.currency,
        branches: org.dunda_branches,
      },
      branch: branch ?? null,
      categories,
      products: products
        .filter((p) => {
          // A product with no branch row is available everywhere.
          if (!branch) return true;
          const row = p.dunda_product_branch_availability[0];
          if (!row) return true;
          return row.available;
        })
        .map((p) => {
          const row = p.dunda_product_branch_availability[0];
          const price = row?.price ?? p.price;
          return {
            id: p.id,
            name: p.name,
            category: p.category,
            price,
            image: p.image,
            description: p.description,
            units: p.dunda_product_units.map((u) => ({
              id: u.id,
              name: u.name,
              price: u.selling_price,
              isBase: u.is_base_unit,
            })),
          };
        }),
    });
  },
);
