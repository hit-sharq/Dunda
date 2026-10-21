import { prisma } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { TRANSACTION_OPTIONS } from "@/lib/db/transaction";
import {
  ApiError,
  conflict,
  moneyRule,
  notFound,
} from "@/lib/errors.server";
import { getTenantSettings } from "@/lib/server/settings";
import {
  createOrder,
  getOrderStatus,
  isCompletedStatus,
  isFailedStatus,
  pesapalConfigured,
  PESAPAL_PROVIDER,
  refundPayment,
} from "@/lib/server/pesapal";
import {
  applyTabPayment,
  rebuildResult,
  type CheckoutResult,
} from "@/lib/server/tabs";
import { orgWhere, assertSameOrg } from "./http";
import { getOrganizationPesapalCredentials } from "./pesapal-credentials";
import { recordPaymentRisk } from "./payments-risk";




export const ELECTRONIC_METHODS = ["MPESA", "CARD", "BANK_TRANSFER"];

export function isElectronicMethod(method: string): boolean {
  return ELECTRONIC_METHODS.includes(method);
}

export interface ClubPaymentInitiation {
  attemptId: string;
  orderTrackingId: string;
  redirectUrl: string;
  amount: number;
  currency: string;
  method: string;
}


export async function initiateClubPayment(input: {
  organizationId: string;
  branchId: string;
  tabId: string;
  amount: number;
  method: string;
  staffId: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  payerName?: string | null;
}): Promise<ClubPaymentInitiation> {
  const tab = await prisma.dunda_tabs.findFirst({
    where: { organization_id: input.organizationId, id: input.tabId },
    include: { dunda_payments: { select: { amount: true, status: true } } },
  });
  if (!tab) throw notFound("That tab");

  
  
  const alreadyPaid = tab.dunda_payments
    .filter((p) => p.status !== "VOIDED")
    .reduce((sum, p) => sum + p.amount, 0);
  const outstanding = Math.max(0, tab.total - alreadyPaid);

  if (input.amount <= 0) {
    throw moneyRule("A payment has to be for something.");
  }
  if (input.amount > outstanding) {
    throw moneyRule(
      `That is more than the ${outstanding} still owed on this tab.`,
    );
  }

  const { currency } = await getTenantSettings(input.organizationId);
  const providerCredentials = await getOrganizationPesapalCredentials(input.organizationId);

  let payerEmail = input.payerEmail;
  let payerPhone = input.payerPhone;
  if (!payerEmail && !payerPhone) {
    const branch = await prisma.dunda_branches.findUnique({
      where: { id: input.branchId },
      select: { phone: true, email: true },
    });
    payerEmail = branch?.email ?? null;
    payerPhone = branch?.phone ?? null;
  }

  const attempt = await prisma.dunda_payment_attempts.create({
    data: {
      organization_id: input.organizationId,
      branch_id: input.branchId,
      tab_id: tab.id,
      amount: input.amount,
      currency,
      method: input.method,
      provider: PESAPAL_PROVIDER,
      status: "INITIATED",
    },
  });

  const organization = await prisma.dunda_organizations.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { name: true },
  });

  const order = await createOrder({
    id: attempt.id,
    amount: input.amount,
    currency,
    description: `Tab ${tab.number} at ${organization.name}`,
    payerEmail,
    payerPhone,
    payerName: input.payerName,
    credentials: providerCredentials,
  });

  await prisma.$transaction(async (tx) => {
    
    
    await tx.dunda_payment_attempts.update({
      where: { id: attempt.id },
      data: { reference: order.orderTrackingId },
    });
    await tx.dunda_payment_provider_transactions.create({
      data: {
        organization_id: input.organizationId,
        kind: "CLUB_PAYMENT",
        provider: PESAPAL_PROVIDER,
        provider_transaction_id: order.orderTrackingId,
        reference: attempt.id,
        amount: input.amount,
        currency,
        status: "INITIATED",
        request_payload: {
          orderId: attempt.id,
          amount: input.amount,
          currency,
          method: input.method,
          tabNumber: tab.number,
        },
        response_payload: order as unknown as Prisma.InputJsonValue,
      },
    });
  }, TRANSACTION_OPTIONS);

  return {
    attemptId: attempt.id,
    orderTrackingId: order.orderTrackingId,
    redirectUrl: order.redirectUrl,
    amount: input.amount,
    currency,
    method: input.method,
  };
}

export async function initiateClubResourcePayment(input: {
  organizationId: string;
  branchId: string;
  amount: number;
  method: string;
  eventTicketId?: string;
  reservationId?: string;
  description: string;
  payerEmail?: string | null;
  payerPhone?: string | null;
  payerName?: string | null;
}): Promise<ClubPaymentInitiation> {
  const hasEventTicket = Boolean(input.eventTicketId);
  const hasReservation = Boolean(input.reservationId);
  if (hasEventTicket === hasReservation) {
    throw new ApiError(400, "A payment must be linked to one event ticket or reservation.", {
      code: "INVALID_PAYMENT_SOURCE",
    });
  }
  if (input.amount <= 0) throw moneyRule("A payment has to be for something.");

  const branch = await prisma.dunda_branches.findFirst({
    where: orgWhere(input.organizationId, { id: input.branchId }),
    select: { id: true, email: true, phone: true },
  });
  if (!branch) throw notFound("That branch");

  const providerCredentials = await getOrganizationPesapalCredentials(input.organizationId);
  const { currency } = await getTenantSettings(input.organizationId);
  const payerEmail = input.payerEmail ?? branch.email;
  const payerPhone = input.payerPhone ?? branch.phone;
  if (!payerEmail && !payerPhone) {
    throw new ApiError(422, "Add a club email or phone number before taking online payments.", {
      code: "PAYER_CONTACT_REQUIRED",
    });
  }

  const attempt = await prisma.dunda_payment_attempts.create({
    data: {
      organization_id: input.organizationId,
      branch_id: branch.id,
      event_ticket_id: input.eventTicketId ?? null,
      reservation_id: input.reservationId ?? null,
      amount: input.amount,
      currency,
      method: input.method,
      provider: PESAPAL_PROVIDER,
      status: "INITIATED",
    },
  });

  let order;
  try {
    order = await createOrder({
      id: attempt.id,
      amount: input.amount,
      currency,
      description: input.description,
      payerEmail,
      payerPhone,
      payerName: input.payerName,
      credentials: providerCredentials,
    });
  } catch (error) {
    await prisma.dunda_payment_attempts.update({
      where: { id: attempt.id },
      data: {
        status: "FAILED",
        failure_reason: error instanceof Error ? error.message : "The payment request failed.",
        resolved_at: new Date(),
      },
    });
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await tx.dunda_payment_attempts.update({
      where: { id: attempt.id },
      data: { reference: order.orderTrackingId },
    });
    await tx.dunda_payment_provider_transactions.create({
      data: {
        organization_id: input.organizationId,
        kind: hasEventTicket ? "EVENT_TICKET_PAYMENT" : "RESERVATION_DEPOSIT",
        provider: PESAPAL_PROVIDER,
        provider_transaction_id: order.orderTrackingId,
        reference: attempt.id,
        amount: input.amount,
        currency,
        status: "INITIATED",
        request_payload: {
          attemptId: attempt.id,
          eventTicketId: input.eventTicketId ?? null,
          reservationId: input.reservationId ?? null,
          amount: input.amount,
          currency,
          method: input.method,
        },
        response_payload: order as unknown as Prisma.InputJsonValue,
      },
    });
  }, TRANSACTION_OPTIONS);

  return {
    attemptId: attempt.id,
    orderTrackingId: order.orderTrackingId,
    redirectUrl: order.redirectUrl,
    amount: input.amount,
    currency,
    method: input.method,
  };
}

export interface ClubPaymentConfirmation {
  attemptId: string;
  outcome: "COMPLETED" | "FAILED" | "PENDING" | "ALREADY_SETTLED";
  paymentId: string | null;
  settlement: CheckoutResult | null;
}


async function updateOrderToCompleted(orderId: string | null): Promise<void> {
  if (!orderId) return;
  await prisma.dunda_orders.update({
    where: { id: orderId },
    data: { status: "COMPLETED" },
  });
}


export async function confirmClubPayment(
  attemptId: string,
): Promise<ClubPaymentConfirmation> {
  const attempt = await prisma.dunda_payment_attempts.findUnique({
    where: { id: attemptId },
  });
  if (!attempt) throw notFound("That payment attempt");

  
  
  if (attempt.status === "RESOLVED" || attempt.status === "FAILED") {
    const payment = await prisma.dunda_payments.findFirst({
      where: { idempotency_key: { startsWith: `${attemptId}#` } },
      select: { id: true, tab_id: true },
    });
    const settlement = payment?.tab_id
      ? await safeRebuild(attempt.organization_id, payment.tab_id)
      : null;
    return {
      attemptId,
      outcome: attempt.status === "RESOLVED" ? "ALREADY_SETTLED" : "FAILED",
      paymentId: payment?.id ?? null,
      settlement,
    };
  }

  
  
  
  const providerCredentials = await getOrganizationPesapalCredentials(
    attempt.organization_id,
  );
  const status = await getOrderStatus(
    attempt.reference ?? attempt.id,
    providerCredentials,
  );

  
  
  if (isFailedStatus(status.status)) {
    await prisma.$transaction(async (tx) => {
      await tx.dunda_payment_attempts.update({
        where: { id: attemptId },
        data: {
          status: "FAILED",
          failure_reason: `Pesapal: ${status.status}`,
          resolved_at: new Date(),
        },
      });
      if (attempt.event_ticket_id) {
        await tx.dunda_event_tickets.updateMany({
          where: {
            id: attempt.event_ticket_id,
            organization_id: attempt.organization_id,
            status: "PENDING_PAYMENT",
          },
          data: { status: "CANCELLED" },
        });
      }
      await tx.dunda_payment_provider_transactions.updateMany({
        where: { provider: PESAPAL_PROVIDER, reference: attemptId },
        data: { status: "FAILED", raw_status: status.status, response_payload: status.raw as Prisma.InputJsonValue },
      });
    }, TRANSACTION_OPTIONS);
    return {
      attemptId,
      outcome: "FAILED",
      paymentId: null,
      settlement: null,
    };
  }

  if (!isCompletedStatus(status.status)) {
    return { attemptId, outcome: "PENDING", paymentId: null, settlement: null };
  }

  if (attempt.event_ticket_id || attempt.reservation_id) {
    const paymentId = await settleLinkedClubPayment(attempt, status);
    await updateOrderToCompleted(attempt.order_id);
    if (paymentId) {
      await recordPaymentRisk({
        paymentId,
        organizationId: attempt.organization_id,
        branchId: attempt.branch_id,
        amount: attempt.amount,
        currency: attempt.currency,
        method: attempt.method,
        paymentAccount: status.paymentAccount ?? null,
        ipAddress: attempt.ip_address ?? null,
        deviceFingerprint: attempt.device_fingerprint ?? null,
        staffId: attempt.staff_id ?? null,
        orderId: attempt.order_id ?? null,
        tabId: attempt.tab_id ?? null,
        receiptId: null,
      });
    }
    return { attemptId, outcome: "COMPLETED", paymentId, settlement: null };
  }

  if (!attempt.tab_id) {
    throw new ApiError(409, "That payment attempt has no supported payment source.", {
      code: "WRONG_STATE",
    });
  }
  const tab = await prisma.dunda_tabs.findUniqueOrThrow({
    where: { id: attempt.tab_id },
    select: { branch_id: true },
  });

  const settlement = await applyTabPayment({
    organizationId: attempt.organization_id,
    tabId: attempt.tab_id,
    branchId: attempt.branch_id ?? tab.branch_id,
    payments: [
      {
        method: attempt.method,
        amount: attempt.amount,
        provider: PESAPAL_PROVIDER,
        reference: status.transactionId ?? status.paymentReference ?? null,
      },
    ],
    staffId: null,
    attemptId,
  });

  await updateOrderToCompleted(attempt.order_id);

  const settledPaymentId = settlement.payments[0]?.id ?? null;
  if (settledPaymentId) {
    await recordPaymentRisk({
      paymentId: settledPaymentId,
      organizationId: attempt.organization_id,
      branchId: attempt.branch_id ?? tab.branch_id,
      amount: attempt.amount,
      currency: attempt.currency,
      method: attempt.method,
      paymentAccount: status.paymentAccount ?? null,
      ipAddress: attempt.ip_address ?? null,
      deviceFingerprint: attempt.device_fingerprint ?? null,
      staffId: attempt.staff_id ?? null,
      orderId: attempt.order_id ?? null,
      tabId: attempt.tab_id ?? null,
      receiptId: null,
    });
  }

  await prisma.dunda_payment_provider_transactions.updateMany({
    where: {
      provider: PESAPAL_PROVIDER,
      provider_transaction_id: status.orderTrackingId,
    },
    data: {
      status: "COMPLETED",
      response_payload: status.raw as Prisma.InputJsonValue,
      raw_status: status.status,
    },
  });

  return {
    attemptId,
    outcome: "COMPLETED",
    paymentId: settlement.payments[0]?.id ?? null,
    settlement,
  };
}

async function settleLinkedClubPayment(
  attempt: NonNullable<Awaited<ReturnType<typeof prisma.dunda_payment_attempts.findUnique>>>,
  status: Awaited<ReturnType<typeof getOrderStatus>>,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const idempotencyKey = `${attempt.id}#settlement`;
    const existing = await tx.dunda_payments.findUnique({
      where: { idempotency_key: idempotencyKey },
      select: { id: true },
    });
    if (existing) return existing.id;

    let branchId = attempt.branch_id;
    let eventTicket: { id: string; branch_id: string | null; status: string } | null = null;
    if (attempt.event_ticket_id) {
      eventTicket = await tx.dunda_event_tickets.findFirst({
        where: { id: attempt.event_ticket_id, organization_id: attempt.organization_id },
        select: { id: true, branch_id: true, status: true },
      });
      if (!eventTicket || eventTicket.status !== "PENDING_PAYMENT") {
        throw conflict("That event ticket is no longer awaiting payment.");
      }
      branchId ??= eventTicket.branch_id;
    }

    let reservation: { id: string; branch_id: string; deposit_amount: number; deposit_paid: number } | null = null;
    if (attempt.reservation_id) {
      reservation = await tx.dunda_reservations.findFirst({
        where: { id: attempt.reservation_id, organization_id: attempt.organization_id },
        select: { id: true, branch_id: true, deposit_amount: true, deposit_paid: true },
      });
      if (!reservation) throw notFound("That reservation");
      if (attempt.amount > reservation.deposit_amount - reservation.deposit_paid) {
        throw conflict("That reservation deposit has already been paid.");
      }
      branchId ??= reservation.branch_id;
    }
    if (!branchId) throw notFound("That payment branch");

    const payment = await tx.dunda_payments.create({
      data: {
        organization_id: attempt.organization_id,
        branch_id: branchId,
        event_ticket_id: attempt.event_ticket_id,
        reservation_id: attempt.reservation_id,
        amount: attempt.amount,
        currency: attempt.currency,
        method: attempt.method,
        provider: PESAPAL_PROVIDER,
        reference: status.transactionId ?? status.paymentReference ?? null,
        status: "SUCCESSFUL",
        cashier_id: null,
        idempotency_key: idempotencyKey,
      },
    });

    if (eventTicket) {
      await tx.dunda_event_tickets.update({
        where: { id: eventTicket.id },
        data: { status: "ISSUED" },
      });
    }
    if (reservation) {
      const depositPaid = reservation.deposit_paid + attempt.amount;
      await tx.dunda_reservations.update({
        where: { id: reservation.id },
        data: {
          deposit_paid: depositPaid,
          ...(depositPaid >= reservation.deposit_amount ? { status: "CONFIRMED" } : {}),
        },
      });
    }

    await tx.dunda_payment_attempts.update({
      where: { id: attempt.id },
      data: { status: "RESOLVED", payment_id: payment.id, resolved_at: new Date() },
    });
    await tx.dunda_payment_provider_transactions.updateMany({
      where: { provider: PESAPAL_PROVIDER, reference: attempt.id },
      data: {
        payment_id: payment.id,
        status: "COMPLETED",
        response_payload: status.raw as Prisma.InputJsonValue,
        raw_status: status.status,
      },
    });
    await tx.dunda_audit_logs.create({
      data: {
        organization_id: attempt.organization_id,
        branch_id: branchId,
        action: "CREATE",
        entity: eventTicket ? "event_ticket_payment" : "reservation_deposit",
        entity_id: eventTicket?.id ?? reservation?.id ?? null,
        detail: `${attempt.amount} ${attempt.currency} paid via Pesapal`,
      },
    });
    return payment.id;
  }, TRANSACTION_OPTIONS);
}

async function safeRebuild(
  organizationId: string,
  tabId: string,
): Promise<CheckoutResult | null> {
  try {
    return await rebuildResult(organizationId, tabId, true);
  } catch {
    return null;
  }
}

export interface RefundClubPaymentInput {
  organizationId: string;
  paymentId: string;
  amount: number;
  reason: string;
  staffId: string | null;
  
  staffName: string;
  /** When true the refund is recorded as PENDING for a manager to approve. */
  requiresApproval?: boolean;
}


/**
 * A refund above this amount does not go out on a staff member's word alone.
 * The refund is recorded as PENDING and a manager has to approve it.
 */
export const REFUND_APPROVAL_THRESHOLD = 10_000;


export async function refundClubPayment(input: RefundClubPaymentInput) {
  const payment = await prisma.dunda_payments.findFirst({
    where: orgWhere(input.organizationId, { id: input.paymentId }),
    include: { dunda_refunds: { select: { amount: true, status: true } } },
  });
  assertSameOrg(payment, input.organizationId, "That payment");

  if (payment.status === "VOIDED") {
    throw moneyRule("That payment has already been voided.");
  }

  // A payment the card issuer is already disputing must not be refunded as
  // well. Doing both is how a club pays for the same order twice.
  const openDispute = await prisma.dunda_payment_disputes.findFirst({
    where: { payment_id: payment.id, status: { in: ["OPEN", "UNDER_REVIEW"] } },
    select: { id: true, status: true, reason: true },
  });
  if (openDispute) {
    throw moneyRule(
      "That payment is being disputed by the card issuer. Deal with the dispute before refunding it.",
    );
  }

  const alreadyRefunded = payment.dunda_refunds
    .filter((refund) => refund.status !== "REJECTED")
    .reduce((sum, refund) => sum + refund.amount, 0);
  const refundable = payment.amount - alreadyRefunded;

  if (input.amount > refundable) {
    throw moneyRule(`Only ${refundable} of that payment can still be refunded.`);
  }

  // A refund above the limit does not go out on one person's word. The
  // request is recorded as PENDING and a manager with approve_refunds has to
  // release it. This check has to happen before the provider call, because
  // reversing the money cannot be taken back.
  const needsApproval =
    input.amount > REFUND_APPROVAL_THRESHOLD && !input.requiresApproval;

  if (needsApproval) {
    const pending = await prisma.dunda_refunds.create({
      data: {
        organization_id: input.organizationId,
        branch_id: payment.branch_id,
        payment_id: payment.id,
        amount: input.amount,
        reason: input.reason,
        status: "PENDING",
        approved_by_id: input.staffId,
      },
      select: { id: true, amount: true, status: true, reason: true },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: input.organizationId,
        branch_id: payment.branch_id,
        staff_id: input.staffId,
        action: "REQUEST",
        entity: "refund",
        entity_id: pending.id,
        detail: `Refund of ${input.amount} needs approval before it is released`,
        new_value: { amount: input.amount, reason: input.reason },
      },
    });

    return { ...pending, status: "PENDING" as const, providerMessage: null };
  }

  let providerMessage: string | null = null;
  if (payment.provider === PESAPAL_PROVIDER) {
    if (alreadyRefunded > 0) {
      throw moneyRule("The provider allows a payment to be refunded once.");
    }
    if (payment.method === "MPESA" && input.amount < payment.amount) {
      throw moneyRule("Mobile money payments can only be refunded in full.");
    }
    if (payment.status !== "SUCCESSFUL") {
      throw moneyRule("Only a completed payment can be refunded by the provider.");
    }
    if (!payment.reference) {
      throw moneyRule("That payment has no confirmation code to refund.");
    }
    
    
    const providerCredentials = await getOrganizationPesapalCredentials(
      input.organizationId,
    );
    providerMessage = await refundPayment({
      confirmationCode: payment.reference,
      amount: input.amount,
      username: input.staffName,
      remarks: input.reason,
      credentials: providerCredentials,
    });
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.dunda_refunds.create({
      data: {
        organization_id: input.organizationId,
        branch_id: payment.branch_id,
        payment_id: payment.id,
        amount: input.amount,
        reason: input.reason,
        status: "APPROVED",
        approved_by_id: input.staffId,
      },
    });

    
    
    
    if (input.amount === payment.amount) {
      await tx.dunda_payments.update({
        where: { id: payment.id },
        data: {
          status: "REFUNDED",
          voided_at: new Date(),
          voided_by_id: input.staffId,
        },
      });
    }

    
    
    
    if (payment.tab_id) {
      const tab = await tx.dunda_tabs.findUniqueOrThrow({
        where: { id: payment.tab_id },
        select: { amount_paid: true, outstanding: true },
      });
      await tx.dunda_tabs.update({
        where: { id: payment.tab_id },
        data: {
          amount_paid: Math.max(0, tab.amount_paid - input.amount),
          outstanding: Math.max(0, tab.outstanding + input.amount),
        },
      });
    }

    
    
    
    if (providerMessage) {
      await tx.dunda_payment_provider_transactions.create({
        data: {
          organization_id: input.organizationId,
          payment_id: payment.id,
          kind: "REFUND",
          provider: PESAPAL_PROVIDER,
          provider_transaction_id: `${payment.reference}-REFUND`,
          reference: payment.reference,
          amount: input.amount,
          currency: payment.currency,
          status: "RECEIVED",
          response_payload: { message: providerMessage },
        },
      });
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: input.organizationId,
        branch_id: payment.branch_id,
        staff_id: input.staffId,
        action: "REFUND",
        entity: "payment",
        entity_id: payment.id,
        detail: `${input.amount} refunded${providerMessage ? ` · ${providerMessage}` : ""}`,
        reason: input.reason,
        previous_value: { status: payment.status },
        new_value: { refundId: created.id, amount: input.amount },
      },
    });

    return created;
  });
}


/**
 * Releases a refund that was held for approval. The provider reversal happens
 * here, so the manager is the one who actually moves the money.
 */
export async function approveRefund(input: {
  organizationId: string;
  refundId: string;
  staffId: string | null;
  staffName: string;
  approve: boolean;
  notes?: string | null;
}) {
  const refund = await prisma.dunda_refunds.findFirst({
    where: orgWhere(input.organizationId, { id: input.refundId }),
    include: {
      dunda_payments: {
        select: {
          id: true,
          amount: true,
          status: true,
          reference: true,
          provider: true,
          method: true,
          tab_id: true,
          branch_id: true,
        },
      },
    },
  });
  if (!refund) throw notFound("That refund request");
  if (refund.status !== "PENDING") {
    throw moneyRule("That refund request has already been dealt with.");
  }

  if (!input.approve) {
    const rejected = await prisma.dunda_refunds.update({
      where: { id: refund.id },
      data: { status: "REJECTED", approved_by_id: input.staffId },
      select: { id: true, amount: true, status: true, reason: true },
    });

    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: input.organizationId,
        branch_id: refund.branch_id,
        staff_id: input.staffId,
        action: "REJECT",
        entity: "refund",
        entity_id: refund.id,
        detail: `Refund of ${refund.amount} rejected`,
        reason: input.notes ?? null,
        previous_value: { status: "PENDING" },
        new_value: { status: "REJECTED" },
      },
    });

    return { ...rejected, providerMessage: null };
  }

  const payment = refund.dunda_payments;
  let providerMessage: string | null = null;

  if (payment.provider === PESAPAL_PROVIDER) {
    if (payment.status !== "SUCCESSFUL") {
      throw moneyRule("Only a completed payment can be refunded by the provider.");
    }
    if (!payment.reference) {
      throw moneyRule("That payment has no confirmation code to refund.");
    }
    const providerCredentials = await getOrganizationPesapalCredentials(
      input.organizationId,
    );
    providerMessage = await refundPayment({
      confirmationCode: payment.reference,
      amount: refund.amount,
      username: input.staffName,
      remarks: refund.reason ?? "Approved refund",
      credentials: providerCredentials,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.dunda_refunds.update({
      where: { id: refund.id },
      data: { status: "APPROVED", approved_by_id: input.staffId },
      select: { id: true, amount: true, status: true, reason: true },
    });

    if (refund.amount === payment.amount) {
      await tx.dunda_payments.update({
        where: { id: payment.id },
        data: {
          status: "REFUNDED",
          voided_at: new Date(),
          voided_by_id: input.staffId,
        },
      });
    }

    if (payment.tab_id) {
      const tab = await tx.dunda_tabs.findUniqueOrThrow({
        where: { id: payment.tab_id },
        select: { amount_paid: true, outstanding: true },
      });
      await tx.dunda_tabs.update({
        where: { id: payment.tab_id },
        data: {
          amount_paid: Math.max(0, tab.amount_paid - refund.amount),
          outstanding: Math.max(0, tab.outstanding + refund.amount),
        },
      });
    }

    await tx.dunda_audit_logs.create({
      data: {
        organization_id: input.organizationId,
        branch_id: refund.branch_id,
        staff_id: input.staffId,
        action: "REFUND",
        entity: "refund",
        entity_id: refund.id,
        detail: `Refund of ${refund.amount} approved${providerMessage ? ` · ${providerMessage}` : ""}`,
        reason: input.notes ?? null,
        previous_value: { status: "PENDING" },
        new_value: { status: "APPROVED", amount: refund.amount },
      },
    });

    return updated;
  });

  return { ...result, providerMessage };
}

export interface BillingPaymentInitiation {
  billingPaymentId: string;
  orderTrackingId: string;
  redirectUrl: string;
  amount: number;
  currency: string;
}


export async function initiateBillingPayment(input: {
  organizationId: string;
  subscriptionId: string;
  kind?: string;
  autoRenew?: boolean;
}): Promise<BillingPaymentInitiation> {
  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { id: input.subscriptionId, organization_id: input.organizationId },
  });
  if (!subscription) throw notFound("That subscription");
  if (!subscription.amount || subscription.amount <= 0) {
    throw moneyRule("That subscription has no amount to collect.");
  }

  if (!pesapalConfigured()) {
    throw new ApiError(
      503,
      "The payment provider is not configured on this deployment.",
      { code: "PROVIDER_NOT_CONFIGURED" },
    );
  }

  
  
  const inFlight = await prisma.dunda_billing_payments.findFirst({
    where: {
      subscription_id: subscription.id,
      status: { in: ["INITIATED", "PENDING"] },
    },
    select: { id: true },
  });
  if (inFlight) {
    throw conflict("That subscription already has a payment in flight.");
  }

  const { currency } = await getTenantSettings(input.organizationId);

  const billingPayment = await prisma.dunda_billing_payments.create({
    data: {
      organization_id: input.organizationId,
      subscription_id: subscription.id,
      kind: input.kind ?? "SUBSCRIPTION_RENEWAL",
      status: "INITIATED",
      amount: subscription.amount,
      currency,
      provider: PESAPAL_PROVIDER,
    },
  });

  const organization = await prisma.dunda_organizations.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { name: true },
  });

  
  
  
  const periodDays = subscription.billing_cycle === "ANNUAL" ? 365 : 30;
  const startsAt = new Date();
  const endsAt = new Date(
    startsAt.getTime() + periodDays * 24 * 60 * 60 * 1000,
  );

  const order = await createOrder({
    id: billingPayment.id,
    amount: subscription.amount,
    currency,
    description: `Dunda ${subscription.plan} subscription for ${organization.name}`,
    
    
    
    accountNumber: input.organizationId,
    subscriptionDetails: input.autoRenew
      ? {
          startDate: startsAt,
          endDate: endsAt,
          frequency:
            subscription.billing_cycle === "ANNUAL" ? "YEARLY" : "MONTHLY",
        }
      : null,
  });

  await prisma.$transaction(async (tx) => {
    await tx.dunda_billing_payments.update({
      where: { id: billingPayment.id },
      data: {
        provider_reference: order.orderTrackingId,
        
        
        
        
        provider_payload: { redirectUrl: order.redirectUrl },
      },
    });
    await tx.dunda_payment_provider_transactions.create({
      data: {
        organization_id: input.organizationId,
        kind: "SUBSCRIPTION",
        provider: PESAPAL_PROVIDER,
        provider_transaction_id: order.orderTrackingId,
        reference: billingPayment.id,
        amount: subscription.amount,
        currency,
        status: "INITIATED",
        request_payload: {
          billingPaymentId: billingPayment.id,
          subscriptionId: subscription.id,
          amount: subscription.amount,
          currency,
          autoRenew: Boolean(input.autoRenew),
        },
        response_payload: order as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.dunda_subscriptions.update({
      where: { id: subscription.id },
      data: {
        auto_renew_pending: Boolean(input.autoRenew) && !subscription.auto_renew,
      },
    });
  }, TRANSACTION_OPTIONS);

  return {
    billingPaymentId: billingPayment.id,
    orderTrackingId: order.orderTrackingId,
    redirectUrl: order.redirectUrl,
    amount: subscription.amount,
    currency,
  };
}

export interface OpenBillingPayment {
  billingPaymentId: string;
  orderTrackingId: string;
  redirectUrl: string;
  amount: number;
  currency: string;
  createdAt: string;
}


const PAYMENT_LINK_TTL_DAYS = 7;


export async function getOpenBillingPayment(
  organizationId: string,
): Promise<OpenBillingPayment | null> {
  const payment = await prisma.dunda_billing_payments.findFirst({
    where: {
      organization_id: organizationId,
      status: { in: ["INITIATED", "PENDING"] },
      created_at: {
        gte: new Date(Date.now() - PAYMENT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      amount: true,
      currency: true,
      provider_reference: true,
      provider_payload: true,
      created_at: true,
    },
  });
  if (!payment) return null;

  const redirectUrl = (
    payment.provider_payload as { redirectUrl?: string } | null
  )?.redirectUrl;
  if (!redirectUrl) return null;

  return {
    billingPaymentId: payment.id,
    orderTrackingId: payment.provider_reference ?? "",
    redirectUrl,
    amount: payment.amount,
    currency: payment.currency,
    createdAt: payment.created_at.toISOString(),
  };
}


export async function requestBillingPayment(
  organizationId: string,
  autoRenew = false,
): Promise<BillingPaymentInitiation> {
  const fresh = await getOpenBillingPayment(organizationId);
  if (fresh) {
    return {
      billingPaymentId: fresh.billingPaymentId,
      orderTrackingId: fresh.orderTrackingId,
      redirectUrl: fresh.redirectUrl,
      amount: fresh.amount,
      currency: fresh.currency,
    };
  }

  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { organization_id: organizationId },
    orderBy: { created_at: "desc" },
  });
  if (!subscription) throw notFound("That club has no subscription.");

  const stale = await prisma.dunda_billing_payments.findMany({
    where: {
      subscription_id: subscription.id,
      status: { in: ["INITIATED", "PENDING"] },
      created_at: {
        lt: new Date(Date.now() - PAYMENT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.dunda_billing_payments.updateMany({
      where: { id: { in: stale.map((payment) => payment.id) } },
      data: {
        status: "FAILED",
        failure_reason: "The payment link expired before it was used.",
      },
    });
  }

  return initiateBillingPayment({
    organizationId,
    subscriptionId: subscription.id,
    kind: "SUBSCRIPTION_RENEWAL",
    autoRenew,
  });
}

export interface BillingPaymentConfirmation {
  billingPaymentId: string;
  outcome: "COMPLETED" | "FAILED" | "PENDING" | "ALREADY_SETTLED";
  subscriptionStatus: string | null;
}


export async function confirmBillingPayment(
  billingPaymentId: string,
): Promise<BillingPaymentConfirmation> {
  const billingPayment = await prisma.dunda_billing_payments.findUnique({
    where: { id: billingPaymentId },
    include: { dunda_subscriptions: true },
  });
  if (!billingPayment) throw notFound("That billing payment");

  const providerTransaction = await prisma.dunda_payment_provider_transactions.findFirst({
    where: {
      provider: PESAPAL_PROVIDER,
      kind: "SUBSCRIPTION",
      reference: billingPaymentId,
    },
    select: { request_payload: true },
  });
  const autoRenewRequested = (
    providerTransaction?.request_payload as { autoRenew?: boolean } | null
  )?.autoRenew === true;

  if (billingPayment.status === "COMPLETED") {
    return {
      billingPaymentId,
      outcome: "ALREADY_SETTLED",
      subscriptionStatus: billingPayment.dunda_subscriptions.status,
    };
  }

  const status = await getOrderStatus(
    billingPayment.provider_reference ?? billingPayment.id,
  );

  if (isFailedStatus(status.status)) {
    await prisma.$transaction(async (tx) => {
      await tx.dunda_billing_payments.update({
        where: { id: billingPaymentId },
        data: {
          status: "FAILED",
          failure_reason: `Pesapal: ${status.status}`,
          provider_transaction_id: status.transactionId,
          provider_payload: status.raw as Prisma.InputJsonValue,
        },
      });
      await tx.dunda_subscriptions.update({
        where: { id: billingPayment.subscription_id },
        data: {
          status: "PAST_DUE",
          auto_renew_pending: false,
          failed_payment_count: {
            increment: 1,
          },
        },
      });
    }, TRANSACTION_OPTIONS);
    return {
      billingPaymentId,
      outcome: "FAILED",
      subscriptionStatus: "PAST_DUE",
    };
  }

  if (!isCompletedStatus(status.status)) {
    return {
      billingPaymentId,
      outcome: "PENDING",
      subscriptionStatus: billingPayment.dunda_subscriptions.status,
    };
  }

  const subscription = billingPayment.dunda_subscriptions;
  const periodDays =
    subscription.billing_cycle === "ANNUAL" ? 365 : 30;
  
  
  
  const renewsFrom = subscription.renews_at ?? new Date();
  const nextRenewal = new Date(
    renewsFrom.getTime() + periodDays * 24 * 60 * 60 * 1000,
  );
  const mandateConfirmed =
    autoRenewRequested &&
    Boolean(status.subscriptionTransactionInfo?.correlationId);

  await prisma.$transaction(async (tx) => {
    await tx.dunda_billing_payments.update({
      where: { id: billingPaymentId },
      data: {
        status: "COMPLETED",
        paid_at: new Date(),
        provider_transaction_id:
          status.transactionId ?? status.paymentReference ?? null,
        provider_payload: status.raw as Prisma.InputJsonValue,
      },
    });
    await tx.dunda_subscriptions.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        failed_payment_count: 0,
        started_at: subscription.started_at ?? new Date(),
        renews_at: nextRenewal,
        auto_renew: subscription.auto_renew || mandateConfirmed,
        auto_renew_pending: autoRenewRequested && !mandateConfirmed,
      },
    });
    await tx.dunda_platform_audit_logs.create({
      data: {
        organization_id: billingPayment.organization_id,
        actor_clerk_user_id: null,
        action: "CREATE",
        entity: "billing_payment",
        entity_id: billingPaymentId,
        detail: `${billingPayment.amount} ${billingPayment.currency} subscription payment completed via Pesapal`,
        new_value: {
          subscriptionId: subscription.id,
          amount: billingPayment.amount,
          providerTransactionId:
            status.transactionId ?? status.paymentReference ?? null,
        },
      },
    });
  }, TRANSACTION_OPTIONS);

  return {
    billingPaymentId,
    outcome: "COMPLETED",
    subscriptionStatus: "ACTIVE",
  };
}

export interface RecurringPaymentResult {
  outcome: "COMPLETED" | "FAILED" | "UNKNOWN_ACCOUNT";
  organizationId: string | null;
  subscriptionStatus: string | null;
}


export async function recordRecurringPayment(
  orderTrackingId: string,
): Promise<RecurringPaymentResult> {
  const status = await getOrderStatus(orderTrackingId);
  const accountReference =
    status.subscriptionTransactionInfo?.accountReference;
  if (!accountReference) {
    return { outcome: "UNKNOWN_ACCOUNT", organizationId: null, subscriptionStatus: null };
  }

  const organization = await prisma.dunda_organizations.findUnique({
    where: { id: accountReference },
    select: { id: true },
  });
  if (!organization) {
    return { outcome: "UNKNOWN_ACCOUNT", organizationId: null, subscriptionStatus: null };
  }

  const subscription = await prisma.dunda_subscriptions.findFirst({
    where: { organization_id: organization.id },
    orderBy: { created_at: "desc" },
  });
  if (!subscription) {
    return {
      outcome: "UNKNOWN_ACCOUNT",
      organizationId: organization.id,
      subscriptionStatus: null,
    };
  }

  
  
  
  if (status.transactionId) {
    const alreadyRecorded = await prisma.dunda_billing_payments.findFirst({
      where: {
        provider: PESAPAL_PROVIDER,
        provider_transaction_id: status.transactionId,
      },
      select: { id: true },
    });
    if (alreadyRecorded) {
      return {
        outcome: "COMPLETED",
        organizationId: organization.id,
        subscriptionStatus: subscription.status,
      };
    }
  }

  const periodDays = subscription.billing_cycle === "ANNUAL" ? 365 : 30;
  
  
  
  const nextRenewal = new Date(
    (subscription.renews_at ?? new Date()).getTime() +
      periodDays * 24 * 60 * 60 * 1000,
  );
  const chargedAmount = status.paymentAmount ?? subscription.amount;
  const chargedCurrency = status.paymentCurrency ?? subscription.currency;

  if (!isCompletedStatus(status.status)) {
    
    
    
    await prisma.$transaction(async (tx) => {
      await tx.dunda_billing_payments.create({
        data: {
          organization_id: organization.id,
          subscription_id: subscription.id,
          kind: "SUBSCRIPTION_RENEWAL",
          status: "FAILED",
          amount: chargedAmount,
          currency: chargedCurrency,
          provider: PESAPAL_PROVIDER,
          provider_transaction_id: status.transactionId ?? null,
          failure_reason: `Pesapal automatic charge: ${status.status}`,
          provider_payload: status.raw as Prisma.InputJsonValue,
        },
      });
      await tx.dunda_subscriptions.update({
        where: { id: subscription.id },
        data: {
          status: "PAST_DUE",
          auto_renew: false,
          auto_renew_pending: false,
          failed_payment_count: { increment: 1 },
        },
      });
    }, TRANSACTION_OPTIONS);
    return {
      outcome: "FAILED",
      organizationId: organization.id,
      subscriptionStatus: "PAST_DUE",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.dunda_billing_payments.create({
      data: {
        organization_id: organization.id,
        subscription_id: subscription.id,
        kind: "SUBSCRIPTION_RENEWAL",
        status: "COMPLETED",
        amount: chargedAmount,
        currency: chargedCurrency,
        provider: PESAPAL_PROVIDER,
        provider_transaction_id: status.transactionId ?? null,
        paid_at: new Date(),
        provider_payload: status.raw as Prisma.InputJsonValue,
      },
    });
    await tx.dunda_subscriptions.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        failed_payment_count: 0,
        auto_renew: true,
        auto_renew_pending: false,
        renews_at: nextRenewal,
      },
    });
    await tx.dunda_platform_audit_logs.create({
      data: {
        organization_id: organization.id,
        actor_clerk_user_id: null,
        action: "CREATE",
        entity: "billing_payment",
        entity_id: null,
        detail: `${chargedAmount} ${chargedCurrency} collected automatically via Pesapal`,
        new_value: {
          subscriptionId: subscription.id,
          amount: chargedAmount,
          providerTransactionId: status.transactionId ?? null,
          correlationId:
            status.subscriptionTransactionInfo?.correlationId ?? null,
        },
      },
    });
  }, TRANSACTION_OPTIONS);

  return {
    outcome: "COMPLETED",
    organizationId: organization.id,
    subscriptionStatus: "ACTIVE",
  };
}

export interface RenewalSweepResult {
  
  checked: number;
  
  initiated: {
    organizationId: string;
    organization: string;
    amount: number;
    redirectUrl: string;
  }[];
  
  skipped: number;
}


export async function runRenewalSweep(): Promise<RenewalSweepResult> {
  const horizon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const mandateGraceCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const pendingMandates = await prisma.dunda_subscriptions.findMany({
    where: {
      auto_renew: false,
      auto_renew_pending: true,
      renews_at: { lte: mandateGraceCutoff },
      status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] },
      cancelled_at: null,
    },
    select: { id: true },
  });
  for (const subscription of pendingMandates) {
    await prisma.dunda_subscriptions.updateMany({
      where: {
        id: subscription.id,
        auto_renew: false,
        auto_renew_pending: true,
        renews_at: { lte: mandateGraceCutoff },
      },
      data: { auto_renew_pending: false },
    });
  }

  const due = await prisma.dunda_subscriptions.findMany({
    where: {
      renews_at: { lte: horizon },
      status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] },
      auto_renew: false,
      auto_renew_pending: false,
      cancelled_at: null,
    },
    include: {
      dunda_organizations: { select: { name: true } },
    },
    orderBy: { renews_at: "asc" },
  });

  const initiated: RenewalSweepResult["initiated"] = [];
  let skipped = 0;

  for (const subscription of due) {
    
    
    
    const inFlight = await prisma.dunda_billing_payments.findFirst({
      where: {
        subscription_id: subscription.id,
        status: { in: ["INITIATED", "PENDING"] },
      },
      select: { id: true },
    });
    if (inFlight) {
      skipped += 1;
      continue;
    }

    try {
      const initiation = await initiateBillingPayment({
        organizationId: subscription.organization_id,
        subscriptionId: subscription.id,
        kind: "SUBSCRIPTION_RENEWAL",
        
        
        
        
        autoRenew: false,
      });
      initiated.push({
        organizationId: subscription.organization_id,
        organization: subscription.dunda_organizations.name,
        amount: initiation.amount,
        redirectUrl: initiation.redirectUrl,
      });
    } catch {
      
      
      
      skipped += 1;
    }
  }

  return { checked: due.length, initiated, skipped };
}


export async function resolveCallbackReference(
  orderTrackingId: string | null,
  merchantReference: string | null,
): Promise<
  | { kind: "CLUB_PAYMENT"; attemptId: string }
  | { kind: "BILLING_PAYMENT"; billingPaymentId: string }
  | null
> {
  const candidates = [orderTrackingId, merchantReference].filter(
    (value): value is string => Boolean(value),
  );
  if (candidates.length === 0) return null;

  const attempt = await prisma.dunda_payment_attempts.findFirst({
    where: {
      OR: [
        { id: { in: candidates } },
        { reference: { in: candidates } },
      ],
    },
    select: { id: true },
  });
  if (attempt) return { kind: "CLUB_PAYMENT", attemptId: attempt.id };

  const billingPayment = await prisma.dunda_billing_payments.findFirst({
    where: {
      OR: [
        { id: { in: candidates } },
        { provider_reference: { in: candidates } },
      ],
    },
    select: { id: true },
  });
  if (billingPayment) {
    return { kind: "BILLING_PAYMENT", billingPaymentId: billingPayment.id };
  }

  return null;
}