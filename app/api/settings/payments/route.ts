import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { conflict } from "@/lib/errors.server";
import { Forbidden, requireSession, route } from "@/lib/server/http";
import {
  encryptPesapalCredentials,
} from "@/lib/server/pesapal-credentials";
import { verifyPesapalCredentials } from "@/lib/server/pesapal";

export const dynamic = "force-dynamic";

const credentialsSchema = z.object({
  consumerKey: z.string().trim().min(1).max(256),
  consumerSecret: z.string().trim().min(1).max(256),
});

async function requireOwner() {
  const session = await requireSession();
  if (!session.isOwner) throw new Forbidden("owner");
  return session;
}

async function hasPendingPayments(organizationId: string) {
  return Boolean(await prisma.dunda_payment_attempts.findFirst({
    where: {
      organization_id: organizationId,
      provider: "PESAPAL",
      status: { in: ["INITIATED", "PENDING"] },
    },
    select: { id: true },
  }));
}

export const GET = route(async () => {
  const session = await requireOwner();
  const settings = await prisma.dunda_organization_settings.findUnique({
    where: { organization_id: session.organizationId! },
    select: { pesapal_credentials_encrypted: true },
  });
  return NextResponse.json({
    configured: Boolean(settings?.pesapal_credentials_encrypted),
  });
});

export const PUT = route(async (request: Request) => {
  const session = await requireOwner();
  const body = await request.json().catch(() => ({}));
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter both Pesapal API credentials.", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  const organizationId = session.organizationId!;
  if (await hasPendingPayments(organizationId)) {
    throw conflict("Wait for pending Pesapal payments to finish before replacing this account.");
  }

  const encrypted = encryptPesapalCredentials(parsed.data);
  await verifyPesapalCredentials(parsed.data);

  await prisma.$transaction(async (tx) => {
    await tx.dunda_organization_settings.upsert({
      where: { organization_id: organizationId },
      create: {
        organization_id: organizationId,
        pesapal_credentials_encrypted: encrypted,
      },
      update: {
        pesapal_credentials_encrypted: encrypted,
        updated_at: new Date(),
      },
    });
    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: session.branchId,
        staff_id: session.staffId,
        action: "UPDATE",
        entity: "payment_provider",
        detail: "Club Pesapal merchant account connected or replaced",
      },
    });
  });

  return NextResponse.json({ configured: true });
});

export const DELETE = route(async () => {
  const session = await requireOwner();
  const organizationId = session.organizationId!;
  if (await hasPendingPayments(organizationId)) {
    throw conflict("Wait for pending Pesapal payments to finish before disconnecting this account.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.dunda_organization_settings.updateMany({
      where: { organization_id: organizationId },
      data: {
        pesapal_credentials_encrypted: null,
        updated_at: new Date(),
      },
    });
    await tx.dunda_audit_logs.create({
      data: {
        organization_id: organizationId,
        branch_id: session.branchId,
        staff_id: session.staffId,
        action: "DELETE",
        entity: "payment_provider",
        detail: "Club Pesapal merchant account disconnected",
      },
    });
  });

  return NextResponse.json({ configured: false });
});