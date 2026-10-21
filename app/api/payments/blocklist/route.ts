import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, parseBody } from "@/lib/server/http";
import { notFound } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const blockSchema = z
  .object({
    kind: z.enum(["CARD", "FINGERPRINT", "IP"]).default("CARD"),
    cardBin: z.string().min(4).max(6).nullable().optional(),
    cardLast4: z.string().length(4).nullable().optional(),
    fingerprint: z.string().min(4).nullable().optional(),
    ipAddress: z.string().min(4).nullable().optional(),
    reason: z.string().min(1, "Say why this is blocked."),
    notes: z.string().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    global: z.boolean().default(false),
  })
  .refine(
    (v) =>
      (v.kind === "CARD" && (v.cardBin || v.cardLast4)) ||
      (v.kind === "FINGERPRINT" && v.fingerprint) ||
      (v.kind === "IP" && v.ipAddress),
    { message: "Give the card, fingerprint or address you are blocking." },
  );

/** The club's list of refused cards, devices and addresses. */
export const GET = route(async (request: Request) => {
  const session = await requirePermission("manage_risk");
  const organizationId = session.organizationId as string;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "ACTIVE";

  const rows = await prisma.dunda_card_blocklist.findMany({
    where: {
      OR: [{ organization_id: null }, { organization_id: organizationId }],
      ...(status !== "ALL" ? { status } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 300,
    include: {
      dunda_staff: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      cardBin: r.card_bin,
      cardLast4: r.card_last4,
      fingerprint: r.fingerprint,
      ipAddress: r.ip_address,
      reason: r.reason,
      status: r.status,
      notes: r.notes,
      global: r.organization_id === null,
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at?.toISOString() ?? null,
      createdBy: r.dunda_staff
        ? { id: r.dunda_staff.id, name: r.dunda_staff.name }
        : null,
    })),
  );
});

export const POST = route(async (request: Request) => {
  checkRateLimit(clientIpKey(request), 30, 60 * 60 * 1000);

  const session = await requirePermission("manage_risk");
  const organizationId = session.organizationId as string;

  const input = await parseBody(blockSchema, request);

  const created = await prisma.dunda_card_blocklist.create({
    data: {
      organization_id: input.global ? null : organizationId,
      kind: input.kind,
      card_bin: input.cardBin ?? null,
      card_last4: input.cardLast4 ?? null,
      fingerprint: input.fingerprint ?? null,
      ip_address: input.ipAddress ?? null,
      reason: input.reason,
      notes: input.notes ?? null,
      status: "ACTIVE",
      expires_at: input.expiresAt ? new Date(input.expiresAt) : null,
      created_by_id: session.staffId,
    },
    select: {
      id: true,
      kind: true,
      card_bin: true,
      card_last4: true,
      ip_address: true,
      fingerprint: true,
      reason: true,
      status: true,
      expires_at: true,
    },
  });

  await prisma.dunda_audit_logs.create({
    data: {
      organization_id: organizationId,
      staff_id: session.staffId,
      action: "CREATE",
      entity: "card_blocklist",
      entity_id: created.id,
      detail: `Blocked ${input.kind.toLowerCase()}: ${input.reason}`,
      new_value: {
        cardBin: created.card_bin,
        cardLast4: created.card_last4,
        ipAddress: created.ip_address,
        global: input.global,
      },
    },
  });

  return NextResponse.json(created, { status: 201 });
});
