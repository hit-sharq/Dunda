import { NextResponse } from "next/server";
import { route, requireSession, requireModule, orgWhere } from "@/lib/server/http";
import { pauseSession, resumeSession, endSession } from "@/lib/server/pool";

export const dynamic = "force-dynamic";

const ACTIONS = ["PAUSE", "RESUME", "END"] as const;


export const POST = route(
  async (request: Request, context: { params: Promise<{ sessionId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
    await requireModule(organizationId, "pool");
    const { sessionId } = await context.params;

    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (!body.action || !ACTIONS.includes(body.action as (typeof ACTIONS)[number])) {
      return NextResponse.json(
        { error: `Say whether to ${ACTIONS.join(", ").toLowerCase()}.`, code: "VALIDATION_FAILED" },
        { status: 422 },
      );
    }

    const action = body.action as (typeof ACTIONS)[number];

    const result =
      action === "PAUSE"
        ? await pauseSession(organizationId, sessionId, session.staffId)
        : action === "RESUME"
          ? await resumeSession(organizationId, sessionId)
          : await endSession(organizationId, sessionId, session.staffId);

    return NextResponse.json({
      id: result.id,
      status: result.status,
      billableMinutes: result.billable_minutes,
      charge: result.charge,
      endedAt: result.ended_at?.toISOString() ?? null,
    });
  },
);