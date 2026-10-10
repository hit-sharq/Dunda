import { NextResponse } from "next/server";
import { route, requireSession } from "@/lib/server/http";
import { getProductReport } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/** What sold over a window, by product. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  if (!dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "Say which days, from and to.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const items = await getProductReport(organizationId, branchId, dateFrom, dateTo);
  return NextResponse.json(items);
});
