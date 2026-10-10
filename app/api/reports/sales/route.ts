import { NextResponse } from "next/server";
import { route, requireSession } from "@/lib/server/http";
import { getSalesReport } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/**
 * Sales over a window. The computation lives in
 * lib/server/reports so the route and any other
 * reader of the same figures answer from one place.
 */
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

  const report = await getSalesReport(organizationId, branchId, dateFrom, dateTo);
  return NextResponse.json(report);
});
