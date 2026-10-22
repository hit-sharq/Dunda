import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, requireSession, orgWhere, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const createBranchSchema = z.object({
  name: z.string().min(1, "Give the branch a name."),
  city: z.string().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

function branchShape(b: any) {
  return {
    id: b.id,
    name: b.name,
    city: b.city,
    status: b.status,
    address: b.address,
    phone: b.phone,
    email: b.email,
  };
}

/** The branches this club runs. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const branches = await prisma.dunda_branches.findMany({
    where: { organization_id: organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      city: true,
      status: true,
      address: true,
      phone: true,
      email: true,
    },
  });

  return NextResponse.json(branches.map(branchShape));
});

export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 20, 60 * 60 * 1000);

  const session = await requirePermission("manage_branches");
  const organizationId = session.organizationId as string;

  const input = await parseBody(createBranchSchema, request);

  const org = await prisma.dunda_organizations.findFirst({
    where: { id: organizationId },
    select: {
      id: true,
      currency: true,
      dunda_subscriptions: {
        orderBy: { created_at: "desc" },
        take: 1,
        select: { dunda_plans: { select: { branch_limit: true } } },
      },
    },
  });
  if (!org) throw notFound("This club");

  // The plan caps how many branches a club may run.
  const limit = org.dunda_subscriptions[0]?.dunda_plans?.branch_limit ?? null;
  if (limit !== null) {
    const existing = await prisma.dunda_branches.count({
      where: { organization_id: organizationId },
    });
    if (existing >= limit) {
      return NextResponse.json(
        {
          error: `Your plan allows ${limit} branch${limit === 1 ? "" : "es"}.`,
          code: "BRANCH_LIMIT_REACHED",
        },
        { status: 422 },
      );
    }
  }

  const created = await prisma.dunda_branches.create({
    data: {
      organization_id: organizationId,
      name: input.name,
      city: input.city ?? "Nairobi",
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      city: true,
      status: true,
      address: true,
      phone: true,
      email: true,
    },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      branch_id: created.id,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "branch",
      entity_id: created.id,
      detail: `Branch ${created.name} opened`,
      new_value: { name: created.name, city: created.city },
    },
  });

  return NextResponse.json(branchShape(created), { status: 201 });
});
