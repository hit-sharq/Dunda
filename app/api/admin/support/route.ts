import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, Forbidden, NotProvisioned, resolveSession } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Support tickets raised by clubs. */
export const GET = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const tickets = await prisma.dunda_support_tickets.findMany({
    where: status ? { status } : undefined,
    orderBy: { created_at: "desc" },
    take: 200,
  });

  const organizations = await prisma.dunda_organizations.findMany({
    select: { id: true, name: true },
  });
  const orgById = new Map(organizations.map((o) => [o.id, o.name]));

  return NextResponse.json(
    tickets.map((t) => ({
      id: t.id,
      organizationId: t.organization_id,
      organizationName: t.organization_id ? orgById.get(t.organization_id) : null,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      body: t.body,
      resolution: t.resolution,
      createdAt: t.created_at.toISOString(),
      resolvedAt: t.resolved_at?.toISOString() ?? null,
    })),
  );
});

export const POST = route(async (request: Request) => {
  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.isOperator) throw new Forbidden("platform_console");

  const body = (await request.json().catch(() => ({}))) as {
    organizationId?: string;
    subject?: string;
    category?: string;
    priority?: string;
    body?: string;
  };

  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json(
      { error: "A ticket needs a subject and a description.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const ticket = await prisma.dunda_support_tickets.create({
    data: {
      organization_id: body.organizationId ?? null,
      opened_by_clerk_user_id: session.clerkUserId,
      subject: body.subject,
      category: body.category ?? "CUSTOMER_ISSUE",
      priority: body.priority ?? "NORMAL",
      body: body.body,
      status: "OPEN",
    },
  });

  return NextResponse.json(
    { id: ticket.id, subject: ticket.subject, status: ticket.status },
    { status: 201 },
  );
});
