import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { route, requireSession } from "@/lib/server/http";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const TICKET_TTL_SECONDS = 60;

function sign(payload: string): string {
  const secret =
    process.env.REALTIME_TICKET_SECRET ?? process.env.CLERK_SECRET_KEY ?? "";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Mints a short-lived ticket for a realtime subscription. The ticket is
 * scoped to the club and branch and expires in a minute, so a ticket that
 * leaks cannot be replayed later or used against another club.
 */
export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

  const session = await requireSession();
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const station = url.searchParams.get("station");

  const branch = await prisma.dunda_branches.findFirst({
    where: { organization_id: organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const expiresAt = Date.now() + TICKET_TTL_SECONDS * 1000;
  const payload = [
    organizationId,
    branch?.id ?? "",
    station ?? "",
    session.clerkUserId,
    String(expiresAt),
  ].join("|");

  const ticket = `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;

  return NextResponse.json({
    ticket,
    expiresInSeconds: TICKET_TTL_SECONDS,
  });
});
