import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { ApiError } from "@/lib/errors.server";

/**
 * Payment fraud and dispute support.
 *
 * Two separate jobs live here:
 *
 *  1. Stopping a bad transaction before the money moves. That is the risk
 *     engine: velocity, value sanity, blocked cards, and the mismatch between
 *     a large card payment and the tab it is settling.
 *
 *  2. Winning the argument afterwards, when the card issuer says the customer
 *     never authorised it. That is the evidence capture: a snapshot of what
 *     was ordered, who served it, from which table, at what time.
 */

export type RiskAction = "ALLOW" | "REVIEW" | "BLOCK";

export interface CardIdentity {
  last4: string | null;
  brand: string | null;
  bin: string | null;
}

export interface RiskSignal {
  code: string;
  detail: string;
  points: number;
}

export interface RiskAssessment {
  score: number;
  action: RiskAction;
  signals: RiskSignal[];
}

export interface RiskContext {
  organizationId: string;
  branchId: string | null;
  amount: number;
  currency: string;
  method: string;
  card: CardIdentity;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  staffId: string | null;
  tabId: string | null;
  orderId: string | null;
}

/* -------------------------------------------------------------------------
 * Tunables. These are the levers a club owner turns; the defaults suit a
 * Kenyan club taking card and M-Pesa payments.
 * ---------------------------------------------------------------------- */

export const RISK_DEFAULTS = {
  /** A card payment above this needs a second pair of eyes. */
  highValueThreshold: 50_000,
  /** A card payment above this is refused outright. */
  hardLimit: 500_000,
  /** More than this many attempts on one card in the window is card testing. */
  maxAttemptsPerCard: 4,
  /** Window for the velocity check. */
  attemptWindowMinutes: 60,
  /** More than this many attempts from one IP in the window. */
  maxAttemptsPerIp: 12,
  /** Score at or above which the payment is held for review. */
  reviewScore: 40,
  /** Score at or above which the payment is refused. */
  blockScore: 75,
  /** Refuse a card payment on a tab with no customer name above this amount. */
  anonymousTabLimit: 20_000,
} as const;

/* -------------------------------------------------------------------------
 * Card identity extraction
 * ---------------------------------------------------------------------- */

const BRAND_BY_PREFIX: Array<[RegExp, string]> = [
  [/^4/, "VISA"],
  [/^5[1-5]/, "MASTERCARD"],
  [/^2[2-7]/, "MASTERCARD"],
  [/^3[47]/, "AMEX"],
  [/^6(?:011|5)/, "DISCOVER"],
  [/^35/, "JCB"],
  [/^3(?:0[0-5]|[68])/, "DINERS"],
  [/^6/, "RUPAY"],
];

/**
 * Pesapal hands back a masked account such as "XXXX XXXX XXXX 4242" or
 * "************4242". We keep only the last four and the issuing BIN, which is
 * all a merchant needs to answer a chargeback and all we should be holding.
 */
export function extractCardIdentity(paymentAccount: string | null): CardIdentity {
  if (!paymentAccount) {
    return { last4: null, brand: null, bin: null };
  }

  const digits = paymentAccount.replace(/\D/g, "");
  if (digits.length < 4) {
    return { last4: null, brand: null, bin: null };
  }

  const last4 = digits.slice(-4);
  // A masked account keeps no BIN, so brand and BIN stay null.
  if (digits.length < 12) {
    return { last4, brand: null, bin: null };
  }

  const bin = digits.slice(0, 6);
  const brand = BRAND_BY_PREFIX.find(([re]) => re.test(digits))?.[1] ?? null;
  return { last4, brand, bin };
}

/* -------------------------------------------------------------------------
 * Blocklist
 * ---------------------------------------------------------------------- */

export interface BlocklistHit {
  id: string;
  kind: string;
  reason: string;
  card_last4: string | null;
  card_bin: string | null;
}

/**
 * Refuses a card, fingerprint or IP that has been blocked for this club, or
 * globally when organizationId is null on the blocklist row.
 */
export async function findBlocklistHit(
  organizationId: string,
  card: CardIdentity,
  ipAddress: string | null,
  deviceFingerprint: string | null,
): Promise<BlocklistHit | null> {
  const now = new Date();
  const rows = await prisma.dunda_card_blocklist.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ organization_id: null }, { organization_id: organizationId }],
      AND: [
        {
          OR: [
            { expires_at: null },
            { expires_at: { gt: now } },
          ],
        },
      ],
    },
    select: {
      id: true,
      kind: true,
      reason: true,
      card_last4: true,
      card_bin: true,
      fingerprint: true,
      ip_address: true,
    },
  });

  for (const row of rows) {
    if (row.card_bin && card.bin && row.card_bin === card.bin) return row;
    if (row.card_last4 && card.last4 && row.card_last4 === card.last4) return row;
    if (
      row.fingerprint &&
      deviceFingerprint &&
      row.fingerprint === deviceFingerprint
    ) {
      return row;
    }
    if (row.ip_address && ipAddress && row.ip_address === ipAddress) return row;
  }

  return null;
}

/* -------------------------------------------------------------------------
 * Risk engine
 * ---------------------------------------------------------------------- */

function roundAmount(amount: number): boolean {
  return amount % 100 === 0;
}

/**
 * Scores a payment. The signals are deliberately explainable: each one says
 * what tripped it, because an unexplained score gets ignored by the staff who
 * have to act on it.
 */
export async function assessPaymentRisk(
  context: RiskContext,
  limits: Partial<typeof RISK_DEFAULTS> = {},
): Promise<RiskAssessment> {
  const rules = { ...RISK_DEFAULTS, ...limits };
  const signals: RiskSignal[] = [];
  const isCard = context.method === "CARD" || context.card.last4 !== null;

  const windowStart = new Date(
    Date.now() - rules.attemptWindowMinutes * 60 * 1000,
  );

  // 1. Blocklist first. A blocked card is blocked, whatever else is true.
  const blocked = await findBlocklistHit(
    context.organizationId,
    context.card,
    context.ipAddress,
    context.deviceFingerprint,
  );
  if (blocked) {
    signals.push({
      code: "BLOCKLISTED",
      detail: `Blocked: ${blocked.reason}`,
      points: 100,
    });
    return { score: 100, action: "BLOCK", signals };
  }

  // 2. Card testing: many attempts on one card in a short window.
  if (context.card.last4) {
    const cardAttempts = await prisma.dunda_payment_attempts.count({
      where: {
        organization_id: context.organizationId,
        method: context.method,
        requested_at: { gte: windowStart },
        reference: { not: null },
      },
    });
    if (cardAttempts >= rules.maxAttemptsPerCard) {
      signals.push({
        code: "CARD_VELOCITY",
        detail: `${cardAttempts} attempts on this card in ${rules.attemptWindowMinutes} minutes`,
        points: 45,
      });
    }
  }

  // 3. IP velocity: many attempts from one address.
  if (context.ipAddress) {
    const ipAttempts = await prisma.dunda_payments.count({
      where: {
        organization_id: context.organizationId,
        ip_address: context.ipAddress,
        paid_at: { gte: windowStart },
      },
    });
    if (ipAttempts >= rules.maxAttemptsPerIp) {
      signals.push({
        code: "IP_VELOCITY",
        detail: `${ipAttempts} payments from this address in ${rules.attemptWindowMinutes} minutes`,
        points: 40,
      });
    }
  }

  // 4. Value sanity.
  if (context.amount > rules.hardLimit) {
    signals.push({
      code: "HARD_LIMIT",
      detail: `Amount above the ${rules.hardLimit} ceiling`,
      points: 100,
    });
  } else if (context.amount > rules.highValueThreshold) {
    signals.push({
      code: "HIGH_VALUE",
      detail: `Amount above ${rules.highValueThreshold}`,
      points: 25,
    });
  }

  // 5. A big card payment settling a tab with no customer on it is the
  //    classic pattern for a card that was never the cardholder's.
  if (isCard && context.amount > rules.anonymousTabLimit && context.tabId) {
    const tab = await prisma.dunda_tabs.findUnique({
      where: { id: context.tabId },
      select: { customer: true, customer_id: true },
    });
    const named =
      Boolean(tab?.customer_id) ||
      Boolean(tab?.customer && tab.customer.trim().length > 1);
    if (!named) {
      signals.push({
        code: "ANONYMOUS_TAB",
        detail: "Large card payment on a tab with no customer named",
        points: 30,
      });
    }
  }

  // 6. A card-not-present payment (QR / online) carries more risk than one
  //    rung up in front of the customer.
  if (isCard && !context.staffId) {
    signals.push({
      code: "CARD_NOT_PRESENT",
      detail: "Card payment with no staff member attached",
      points: 20,
    });
  }

  // 7. A first card at this club for a large amount.
  if (isCard && context.card.last4) {
    const prior = await prisma.dunda_payments.count({
      where: {
        organization_id: context.organizationId,
        card_last4: context.card.last4,
        status: { not: "VOIDED" },
      },
    });
    if (prior === 0 && context.amount > rules.highValueThreshold) {
      signals.push({
        code: "NEW_CARD_HIGH_VALUE",
        detail: "First payment on this card and it is a large one",
        points: 20,
      });
    }
  }

  // 8. Odd amounts on card payments read as probing.
  if (isCard && !roundAmount(context.amount) && context.amount < 5_000) {
    signals.push({
      code: "ODD_AMOUNT",
      detail: "Unusual amount for a small card payment",
      points: 10,
    });
  }

  const score = Math.min(100, signals.reduce((sum, s) => sum + s.points, 0));
  const action: RiskAction =
    score >= rules.blockScore
      ? "BLOCK"
      : score >= rules.reviewScore
        ? "REVIEW"
        : "ALLOW";

  return { score, action, signals };
}

export function assertPaymentAllowed(assessment: RiskAssessment): void {
  if (assessment.action === "BLOCK") {
    const reason = assessment.signals
      .map((s) => s.detail)
      .join("; ");
    throw new ApiError(403, `This payment was refused: ${reason}`, {
      code: "PAYMENT_BLOCKED",
    });
  }
}

/* -------------------------------------------------------------------------
 * Evidence capture
 * ---------------------------------------------------------------------- */

export interface PaymentEvidence {
  capturedAt: string;
  order: {
    id: string;
    number: string;
    status: string;
    total: number;
    createdAt: string;
    table: string | null;
    branch: string | null;
    staff: { id: string; name: string } | null;
    customer: { id: string; name: string; phone: string | null } | null;
    items: Array<{
      name: string;
      quantity: number;
      unitPrice: number;
      total: number;
      notes: string | null;
    }>;
  } | null;
  tab: { id: string; number: string; total: number; customer: string | null } | null;
  receipt: { id: string; number: string; issuedAt: string } | null;
  staff: { id: string; name: string } | null;
}

/**
 * Snapshots everything a card issuer will ask for when they say the customer
 * never got the goods: what was ordered, who served it, from which table, at
 * what time, and which receipt was issued.
 */
export async function capturePaymentEvidence(
  organizationId: string,
  input: {
    orderId?: string | null;
    tabId?: string | null;
    staffId?: string | null;
    receiptId?: string | null;
  },
): Promise<PaymentEvidence | null> {
  const order = input.orderId
    ? await prisma.dunda_orders.findFirst({
        where: { id: input.orderId, organization_id: organizationId },
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          created_at: true,
          table_name: true,
          staff_id: true,
          customer_id: true,
          dunda_order_items: {
            select: {
              name: true,
              quantity: true,
              unit_price: true,
              total: true,
              notes: true,
            },
          },
        },
      })
    : null;

  const tab = input.tabId
    ? await prisma.dunda_tabs.findFirst({
        where: { id: input.tabId, organization_id: organizationId },
        select: { id: true, number: true, total: true, customer: true, customer_id: true },
      })
    : null;

  const receipt = input.receiptId
    ? await prisma.dunda_receipts.findFirst({
        where: { id: input.receiptId, organization_id: organizationId },
        select: { id: true, number: true, issued_at: true },
      })
    : input.tabId
      ? await prisma.dunda_receipts.findFirst({
          where: { organization_id: organizationId, tab_id: input.tabId },
          orderBy: { issued_at: "desc" },
          select: { id: true, number: true, issued_at: true },
        })
      : null;

  const staffId = input.staffId ?? order?.staff_id ?? null;
  const staff = staffId
    ? await prisma.dunda_staff.findFirst({
        where: { id: staffId, organization_id: organizationId },
        select: { id: true, name: true },
      })
    : null;

  const customerId = order?.customer_id ?? tab?.customer_id ?? null;
  const customer = customerId
    ? await prisma.dunda_customers.findFirst({
        where: { id: customerId, organization_id: organizationId },
        select: { id: true, name: true, phone: true },
      })
    : null;

  const branch = await prisma.dunda_branches.findFirst({
    where: { organization_id: organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return {
    capturedAt: new Date().toISOString(),
    order: order
      ? {
          id: order.id,
          number: order.number,
          status: order.status,
          total: order.total,
          createdAt: order.created_at.toISOString(),
          table: order.table_name,
          branch: branch?.name ?? null,
          staff: staff ? { id: staff.id, name: staff.name } : null,
          customer: customer
            ? { id: customer.id, name: customer.name, phone: customer.phone }
            : null,
          items: order.dunda_order_items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unit_price,
            total: i.total,
            notes: i.notes,
          })),
        }
      : null,
    tab: tab
      ? { id: tab.id, number: tab.number, total: tab.total, customer: tab.customer }
      : null,
    receipt: receipt
      ? {
          id: receipt.id,
          number: receipt.number,
          issuedAt: receipt.issued_at.toISOString(),
        }
      : null,
    staff: staff ? { id: staff.id, name: staff.name } : null,
  };
}

/* -------------------------------------------------------------------------
 * Chargeback rate
 * ---------------------------------------------------------------------- */

export interface ChargebackSummary {
  windowDays: number;
  settledPayments: number;
  disputedPayments: number;
  disputedAmount: number;
  chargebackRate: number;
  openDisputes: number;
  wonDisputes: number;
  lostDisputes: number;
  liabilityAmount: number;
}

/**
 * The number the acquirer actually watches. Above roughly 1% of settled
 * payments, the acquirer starts adding fees or pulling the facility.
 */
export async function summariseChargebacks(
  organizationId: string,
  windowDays = 90,
): Promise<ChargebackSummary> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [settled, disputed, open, won, lost, liability] = await Promise.all([
    prisma.dunda_payments.count({
      where: {
        organization_id: organizationId,
        status: "SUCCESSFUL",
        paid_at: { gte: since },
      },
    }),
    prisma.dunda_payment_disputes.aggregate({
      where: { organization_id: organizationId, opened_at: { gte: since } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.dunda_payment_disputes.count({
      where: { organization_id: organizationId, status: "OPEN" },
    }),
    prisma.dunda_payment_disputes.count({
      where: { organization_id: organizationId, status: "WON" },
    }),
    prisma.dunda_payment_disputes.count({
      where: { organization_id: organizationId, status: "LOST" },
    }),
    prisma.dunda_payment_disputes.aggregate({
      where: {
        organization_id: organizationId,
        liability: "MERCHANT",
        opened_at: { gte: since },
      },
      _sum: { amount: true },
    }),
  ]);

  const disputedPayments = disputed._count;
  return {
    windowDays,
    settledPayments: settled,
    disputedPayments,
    disputedAmount: disputed._sum.amount ?? 0,
    chargebackRate: settled > 0 ? disputedPayments / settled : 0,
    openDisputes: open,
    wonDisputes: won,
    lostDisputes: lost,
    liabilityAmount: liability._sum.amount ?? 0,
  };
}

export function evidenceToJson(evidence: PaymentEvidence | null): Prisma.InputJsonValue | null {
  return evidence ? (evidence as unknown as Prisma.InputJsonValue) : null;
}

/* -------------------------------------------------------------------------
 * Recording
 * ---------------------------------------------------------------------- */

export interface RecordRiskInput {
  paymentId: string;
  organizationId: string;
  branchId: string | null;
  amount: number;
  currency: string;
  method: string;
  /** The masked account Pesapal returned, e.g. "XXXX XXXX XXXX 4242". */
  paymentAccount: string | null;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  staffId: string | null;
  orderId: string | null;
  tabId: string | null;
  receiptId: string | null;
}

/**
 * Enriches a settled payment with the card identity, the risk score and the
 * evidence bundle. Runs after the money moved, so a REVIEW verdict here is a
 * flag for a human, not a block.
 */
export async function recordPaymentRisk(input: RecordRiskInput): Promise<RiskAssessment> {
  const card = extractCardIdentity(input.paymentAccount);

  const assessment = await assessPaymentRisk({
    organizationId: input.organizationId,
    branchId: input.branchId,
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    card,
    ipAddress: input.ipAddress,
    deviceFingerprint: input.deviceFingerprint,
    staffId: input.staffId,
    tabId: input.tabId,
    orderId: input.orderId,
  });

  const evidence = await capturePaymentEvidence(input.organizationId, {
    orderId: input.orderId,
    tabId: input.tabId,
    staffId: input.staffId,
    receiptId: input.receiptId,
  });

  await prisma.dunda_payments.update({
    where: { id: input.paymentId },
    data: {
      card_last4: card.last4,
      card_brand: card.brand,
      card_bin: card.bin,
      ip_address: input.ipAddress,
      device_fingerprint: input.deviceFingerprint,
      risk_score: assessment.score,
      risk_flags: assessment.signals as unknown as Prisma.InputJsonValue,
      risk_action: assessment.action,
      evidence: evidence ? (evidence as unknown as Prisma.InputJsonValue) : undefined,
    },
  });

  if (assessment.action === "REVIEW") {
    await prisma.dunda_audit_logs.create({
      data: {
        organization_id: input.organizationId,
        branch_id: input.branchId,
        staff_id: input.staffId,
        action: "REVIEW",
        entity: "payment",
        entity_id: input.paymentId,
        detail: `Payment flagged for review (score ${assessment.score})`,
        new_value: {
          score: assessment.score,
          signals: assessment.signals,
          cardLast4: card.last4,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return assessment;
}

/* -------------------------------------------------------------------------
 * Pre-payment guard
 * ---------------------------------------------------------------------- */

/**
 * Refuses a card, fingerprint or IP that is on the blocklist before the
 * customer is sent to the payment page. This is the guard that actually stops
 * fraud: everything after the redirect is post-mortem.
 */
export async function assertNotBlockedBeforePayment(input: {
  organizationId: string;
  card?: CardIdentity | null;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
}): Promise<void> {
  const hit = await findBlocklistHit(
    input.organizationId,
    input.card ?? { last4: null, brand: null, bin: null },
    input.ipAddress ?? null,
    input.deviceFingerprint ?? null,
  );
  if (hit) {
    throw new ApiError(
      403,
      "This card is not accepted for payments. Please speak to the counter.",
      { code: "PAYMENT_BLOCKED" },
    );
  }
}
