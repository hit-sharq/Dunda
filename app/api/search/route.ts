import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The command palette search in the top bar. It looks across the things a
 * staff member reaches for most: products, orders, tabs, tables and guests.
 * Everything is scoped to the signed-in club.
 */
export const GET = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 120, 60 * 60 * 1000);

  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const term = (url.searchParams.get("q") ?? "").trim();

  if (term.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const like = { contains: term, mode: "insensitive" as const };
  const take = 5;

  const [products, orders, tabs, tables, customers] = await Promise.all([
    prisma.dunda_products.findMany({
      where: { ...orgWhere(organizationId), name: like, active: true },
      take,
      select: { id: true, name: true, category: true, price: true },
    }),
    prisma.dunda_orders.findMany({
      where: { ...orgWhere(organizationId), number: like },
      take,
      select: { id: true, number: true, status: true, total: true, table_name: true },
    }),
    prisma.dunda_tabs.findMany({
      where: { ...orgWhere(organizationId), number: like },
      take,
      select: { id: true, number: true, customer: true, table_name: true, total: true },
    }),
    prisma.dunda_tables.findMany({
      where: { ...orgWhere(organizationId), name: like },
      take,
      select: { id: true, name: true, section: true, status: true },
    }),
    prisma.dunda_customers.findMany({
      where: { ...orgWhere(organizationId), name: like },
      take,
      select: { id: true, name: true, phone: true },
    }),
  ]);

  const results = [
    ...products.map((p) => ({
      type: "product",
      id: p.id,
      title: p.name,
      subtitle: `${p.category} · KES ${p.price}`,
      href: "/products",
    })),
    ...orders.map((o) => ({
      type: "order",
      id: o.id,
      title: `Order ${o.number}`,
      subtitle: `${o.status}${o.table_name ? ` · ${o.table_name}` : ""} · KES ${o.total}`,
      href: "/orders",
    })),
    ...tabs.map((t) => ({
      type: "tab",
      id: t.id,
      title: `Tab ${t.number}`,
      subtitle: `${t.customer || "Walk-in"}${t.table_name ? ` · ${t.table_name}` : ""} · KES ${t.total}`,
      href: "/pos",
    })),
    ...tables.map((t) => ({
      type: "table",
      id: t.id,
      title: t.name,
      subtitle: `${t.section} · ${t.status}`,
      href: "/floor",
    })),
    ...customers.map((c) => ({
      type: "customer",
      id: c.id,
      title: c.name,
      subtitle: c.phone ?? "Guest",
      href: "/customers",
    })),
  ];

  return NextResponse.json({ results });
});
