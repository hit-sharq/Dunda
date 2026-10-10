import { NextResponse } from "next/server";
import { route, requireSession } from "@/lib/server/http";
import { getEventReport } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/** Events and how full they ran, from the reservations they drew. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const items = await getEventReport(organizationId, branchId);
  return NextResponse.json(items);
});
