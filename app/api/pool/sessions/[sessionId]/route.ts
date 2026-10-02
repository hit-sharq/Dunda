import { NextResponse } from "next/server";
import { route, requireSession, orgWhere } from "@/lib/server/http";
import { pauseSession, resumeSession, endSession } from "@/lib/server/pool";

export const dynamic = "force-dynamic";

const ACTIONS = ["PAUSE", "RESUME", "END"] as const;

/**
 * Pauses, resumes or ends a game.
 *
 * Ending is what puts the charge on the tab, so it is the only action here that
 * moves money. It is refused while the session is still paused, because a paused
 * table has not finished accumulating.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ sessionId: string }> }) => {
    const session = await requireSession();
    const organizationId = session.organizationId as string;
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
