import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession, orgWhere } from "@/lib/server/http";

export const dynamic = "force-dynamic";


export const GET = route(async () => {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "up",
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    
    
    return NextResponse.json(
      {
        status: "degraded",
        database: "down",
        error: "The database did not answer.",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
});


export const PUT = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const body = (await request.json()) as { module?: string; enabled?: boolean };
  if (!body.module || typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "A module and an enabled flag are required.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const row = await prisma.dunda_organization_features.upsert({
    where: {
      organization_id_module: { organization_id: organizationId, module: body.module },
    },
    create: {
      organization_id: organizationId,
      module: body.module,
      enabled: body.enabled,
    },
    update: { enabled: body.enabled },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      staff_id: session.staffId,
      action: "UPDATE",
      entity: "organization_feature",
      entity_id: row.id,
      detail: `${body.module} ${body.enabled ? "enabled" : "disabled"}`,
      new_value: { module: body.module, enabled: body.enabled },
    },
  });

  return NextResponse.json(row);
});