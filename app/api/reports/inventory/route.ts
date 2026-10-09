import { NextResponse } from "next/server";
import { route, requireSession } from "@/lib/server/http";
import { getInventoryReport } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/**
 * Inventory position, movements and discrepancies.
 *
 * The computation lives in lib/server/reports so the
 * report and any other reader of the same figures
 * answer from one place.
 */
export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const organizationId = session.organizationId as string;

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId") ?? session.branchId;

  const report = await getInventoryReport(organizationId, branchId);
  return NextResponse.json(report);
});
