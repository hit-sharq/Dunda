import { NextResponse } from "next/server";
import { route, requireSession } from "@/lib/server/http";
import { getStaffReport } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/** Completed orders attributed to the staff member who served them. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const items = await getStaffReport(organizationId, branchId);
  return NextResponse.json(items);
});
