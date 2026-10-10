import { NextResponse } from "next/server";
import { route, requireSession } from "@/lib/server/http";
import { getTableReport } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/** Tables and the trade they saw. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const items = await getTableReport(organizationId, branchId);
  return NextResponse.json(items);
});
