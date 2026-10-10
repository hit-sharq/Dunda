import { NextResponse } from "next/server";
import { route, requireSession } from "@/lib/server/http";
import { getPaymentReport } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/** Money taken, money returned, and the mix of ways it arrived. */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const report = await getPaymentReport(organizationId, branchId);
  return NextResponse.json(report);
});
