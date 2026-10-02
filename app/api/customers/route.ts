import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere, assertSameOrg } from "@/lib/server/http";
import { createCustomerSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

/**
 * Guests Dunda knows by name, with how often they come and what they spend.
 *
 * The totals are maintained from payments rather than edited, so a guest's history
 * cannot be lost by somebody updating a profile.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();

  // Assembled with Prisma's own type rather than spread, so the search clause
  // keeps its string-filter shape instead of widening to something unusable.
  const where: Prisma.dunda_customersWhereInput = { organization_id: organizationId };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const customers = await prisma.dunda_customers.findMany({
    where,
    orderBy: { name: "asc" },
    take: 200,
    include: {
      _count: { select: { dunda_orders: true, dunda_reservations: true } },
    },
  });

  return NextResponse.json(
    customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      vipLevel: c.vip_level,
      totalVisits: c.total_visits,
      totalSpend: c.total_spend,
      lastVisitAt: c.last_visit_at?.toISOString() ?? null,
      notes: c.notes,
      createdAt: c.created_at.toISOString(),
      orderCount: c._count.dunda_orders,
      reservationCount: c._count.dunda_reservations,
    })),
  );
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const body = await request.json().catch(() => ({}));
  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue ? `${issue.path.join(".") || "customer"}: ${issue.message}` : "Invalid guest.",
        code: "VALIDATION_FAILED",
      },
      { status: 422 },
    );
  }

  const customer = await prisma.dunda_customers.create({
    data: {
      organization_id: organizationId,
      branch_id: session.branchId,
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      notes: parsed.data.notes ?? null,
    },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: session.branchId,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "customer",
      entity_id: customer.id,
      detail: `${customer.name} added`,
    },
  });

  return NextResponse.json(
    {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      totalVisits: customer.total_visits,
      totalSpend: customer.total_spend,
      createdAt: customer.created_at.toISOString(),
    },
    { status: 201 },
  );
});
