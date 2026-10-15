import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { route, Forbidden } from "@/lib/server/http";
import { markScheduledJobRun } from "@/lib/server/cron";
import { runRenewalSweep } from "@/lib/server/payments";

export const dynamic = "force-dynamic";


function isScheduledCall(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const signature = request.headers.get("x-vercel-cron-signature");
  if (!secret || !signature) return false;

  const [timestampPart, signaturePart] = signature.split(",");
  if (
    !timestampPart?.startsWith("t=") ||
    !signaturePart?.startsWith("v1=")
  ) {
    return false;
  }

  const expected = `v1=${createHmac("sha256", secret)
    .update(timestampPart)
    .digest("hex")}`;

  
  
  const received = Buffer.from(signaturePart);
  const computed = Buffer.from(expected);
  return (
    received.length === computed.length &&
    timingSafeEqual(received, computed)
  );
}

export const GET = route(async (request: Request) => {
  if (!isScheduledCall(request)) {
    throw new Forbidden("cron");
  }

  const result = await runRenewalSweep();
  
  
  
  
  await markScheduledJobRun("renewal-sweep");
  return NextResponse.json(result);
});