import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * Whether a setup link is still good, so the invite screen can tell the
 * guest before they type anything.
 */
export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  if (!token) {
    return NextResponse.json(
      { claimable: false, reason: "That link is incomplete." },
      { status: 200 },
    );
  }

  const hash = createHash("sha256").update(token).digest("hex");
  const row = await prisma.dunda_setup_tokens.findFirst({
    where: { token_hash: hash },
    select: {
      id: true,
      expires_at: true,
      consumed_at: true,
      dunda_organizations: { select: { name: true, status: true } },
    },
  });

  if (!row) {
    return NextResponse.json({
      claimable: false,
      reason: "That link is not valid.",
    });
  }

  if (row.consumed_at) {
    return NextResponse.json({
      claimable: false,
      reason: "That link has already been used.",
    });
  }

  if (row.expires_at && row.expires_at < new Date()) {
    return NextResponse.json({
      claimable: false,
      reason: "That link has expired.",
    });
  }

  return NextResponse.json({ claimable: true, reason: null });
});
