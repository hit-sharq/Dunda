import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const productQuerySchema = z.object({
  category_id: z.string().optional(),
  search: z.string().optional(),
  active: z.boolean().optional().default(true),
});

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
    include: {
      dunda_product_units: {
        select: { id: true, name: true, selling_price: true, conversion_factor: true, is_base_unit: true },
        orderBy: { is_base_unit: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(products);
});
