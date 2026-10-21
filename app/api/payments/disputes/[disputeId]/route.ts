import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { route, requirePermission, orgWhere, parseBody } from "@/lib/server/http";
import { notFound, wrongState } from "@/lib/errors.server";
import { checkRateLimit, clientIpKey } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const respondSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "WON", "LOST"]),
  liability: z.enum(["MERCHANT", "CUSTOMER", "SHARED", "UNDETERMINED"]).optional(),
  notes: z.string().nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).nullable().optional(),
});

/**
 * Records what was sent to the card issuer in answer to a chargeback, and how
 * it ended. The liability split is what the acquirer pays out on, so the
 * liability amount on the club follows from it.
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ disputeId: string }> }) => {
    checkRateLimit(clientIpKey(request), 60, 60 * 60 * 1000);

    const session = await requirePermission("manage_disputes");
    const organizationId = session.organizationId as string;
    const { disputeId } = await context.params;

    const input = await parseBody(respondSchema, request);

    const dispute = await prisma.dunda_payment_disputes.findFirst({
      where: orgWhere(organizationId, { id: disputeId }),
      select: {
        id: true,
        status: true,
        payment_id: true,
        branch_id: true,
        amount: true,
        evidence: true,
      },
    });
    if (!dispute) throw notFound("That dispute");
    if (dispute.status === "WON" || dispute.status === "LOST") {
      throw wrongState("That dispute is already closed.");
    }

    // The evidence that goes to the issuer is the evidence we hold plus
    // whatever the manager wants to add at the point of responding.
    const merged = {
      ...(dispute.evidence as Record<string, unknown> | null ?? {}),
      ...(input.evidence ?? {}),
    };

    const closed = input.status === "WON" || input.status === "LOST";

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.dunda_payment_disputes.update({
        where: { id: dispute.id },
        data: {
          status: input.status,
          liability: input.liability ?? undefined,
          notes: input.notes ?? undefined,
          evidence: Object.keys(merged).length ? (merged as any) : undefined,
          responded_at: new Date(),
          responded_by_id: session.staffId,
          resolved_at: closed ? new Date() : undefined,
        },
        select: {
          id: true,
          status: true,
          liability: true,
          amount: true,
          responded_at: true,
          resolved_at: true,
        },
      });

      await tx.dunda_payments.update({
        where: { id: dispute.payment_id },
        data: { dispute_status: input.status },
      });

      await tx.dunda_audit_logs.create({
        data: {
          organization_id: organizationId,
          branch_id: dispute.branch_id,
          staff_id: session.staffId,
          action: "UPDATE",
          entity: "payment_dispute",
          entity_id: dispute.id,
          detail: `Dispute ${input.status.toLowerCase()}${input.liability ? ` · liability ${input.liability.toLowerCase()}` : ""}`,
          reason: input.notes ?? null,
          previous_value: { status: dispute.status },
          new_value: { status: input.status, liability: input.liability ?? null },
        },
      });

      return row;
    });

    return NextResponse.json(updated);
  },
);
