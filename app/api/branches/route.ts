import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  route,
  requireSession,
  orgWhere,
  Forbidden,
  parseBody,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * The club's branches with live floor counts.
 *
 * Occupied and total are derived from the tables and pool tables rather than held
 * on the branch row, because a counter that is only updated on some paths drifts.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);

  const branches = await prisma.dunda_branches.findMany({
    where: orgWhere(organizationId),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      city: true,
      address: true,
      status: true,
      timezone: true,
      phone: true,
      email: true,
    },
  });

  const counts = await Promise.all(
    branches.map(async (branch) => {
      const [tables, poolTables, activeSessions] = await Promise.all([
        prisma.dunda_tables.findMany({
          where: { organization_id: organizationId, branch_id: branch.id },
          select: { status: true },
        }),
        prisma.dunda_pool_tables.findMany({
          where: { organization_id: organizationId, branch_id: branch.id },
          select: { status: true },
        }),
        prisma.dunda_pool_sessions.count({
          where: {
            organization_id: organizationId,
            branch_id: branch.id,
            status: { in: ["ACTIVE", "PAUSED"] },
          },
        }),
      ]);

      const total = tables.length + poolTables.length;
      const active =
        tables.filter((t) => t.status === "OCCUPIED").length +
        poolTables.filter((t) => t.status === "OCCUPIED").length;

      return { branch, total, active, activeSessions };
    }),
  );

  return NextResponse.json(
    counts.map(({ branch, total, active, activeSessions }) => ({
      id: branch.id,
      name: branch.name,
      city: branch.city,
      address: branch.address,
      status: branch.status,
      timezone: branch.timezone,
      phone: branch.phone,
      email: branch.email,
      totalTables: total,
      activeTables: active,
      activeSessions,
    })),
  );
});

const addBranchSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  timezone: z.string().min(1).optional(),
});

/**
 * Opens another branch for the caller's club.
 *
 * The plan's branch limit is a commercial boundary, so it is
 * checked against the live count of branches rather than a
 * stored counter, and the refusal says what to do about it.
 */
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;
  if (!session.isOwner && !session.permissions.has("manage_branches")) {
    throw new Forbidden("manage_branches");
  }

  const input = await parseBody(addBranchSchema, request);

  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { organization_id: organizationId },
    orderBy: { created_at: "desc" },
    select: { branch_limit: true },
  });
  const branchLimit = subscription?.branch_limit ?? 1;
  const branchCount = await prisma.dunda_branches.count({
    where: orgWhere(organizationId),
  });
  if (branchLimit > 0 && branchCount >= branchLimit) {
    return NextResponse.json(
      {
        error: `This plan allows ${branchLimit} branch${branchLimit === 1 ? "" : "es"}. Upgrade to open another.`,
        code: "BRANCH_LIMIT_REACHED",
        branchLimit,
      },
      { status: 422 },
    );
  }

  const branch = await prisma.dunda_branches.create({
    data: {
      organization_id: organizationId,
      name: input.name.trim(),
      city: input.city.trim(),
      address: input.address?.trim() ?? null,
      phone: input.phone?.trim() ?? null,
      email: input.email?.trim() ?? null,
      timezone: input.timezone ?? "Africa/Nairobi",
    },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "branch",
      entity_id: branch.id,
      detail: `${branch.name} opened in ${branch.city}`,
      new_value: { name: branch.name, city: branch.city },
    },
  });

  return NextResponse.json(
    {
      id: branch.id,
      name: branch.name,
      city: branch.city,
      address: branch.address,
      status: branch.status,
      timezone: branch.timezone,
      phone: branch.phone,
      email: branch.email,
    },
    { status: 201 },
  );
});
