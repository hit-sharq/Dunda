import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * What the platform owner does that changes money: suspensions, plan changes,
 * billing actions. Separate from a club's own audit log because those two records
 * answer different questions — one is "what did this club do", the other is "what
 * did Dunda do to this club".
 */
export const GET = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const action = url.searchParams.get("action");

  const entries = await prisma.dunda_platform_audit_logs.findMany({
    where: {
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(action ? { action } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 200,
  });

  const organizations = await prisma.dunda_organizations.findMany({
    select: { id: true, name: true },
  });
  const orgById = new Map(organizations.map((o) => [o.id, o.name]));

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      actorClerkUserId: e.actor_clerk_user_id,
      organizationId: e.organization_id,
      organizationName: e.organization_id ? orgById.get(e.organization_id) : null,
      action: e.action,
      entity: e.entity,
      entityId: e.entity_id,
      detail: e.detail,
      previousValue: e.previous_value,
      newValue: e.new_value,
      ipAddress: e.ip_address,
      at: e.created_at.toISOString(),
    })),
  );
});
