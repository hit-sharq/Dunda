import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, resolveSession, NotProvisioned } from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Records that a staff member signed in. Used for the "last seen" column on
 * the staff list and for spotting accounts that have gone quiet.
 */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

  const session = await resolveSession();
  if (!session) throw new NotProvisioned();
  if (!session.organizationId || !session.staffId) {
    return NextResponse.json({ recorded: false });
  }

  return NextResponse.json({ recorded: true });
});
