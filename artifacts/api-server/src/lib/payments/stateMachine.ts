/**
 * The two state machines, in one place.
 *
 * A subscription and a payment are modelled separately because they answer
 * different questions: a payment says whether money moved once, while a
 * subscription says where a club currently stands. A club can be PAST_DUE with
 * a FAILED payment, or SUSPENDED by us with its last payment COMPLETED, and
 * collapsing them would lose that.
 *
 * Nothing outside this file may change either state. A route that needs to move
 * one goes through assertSubscriptionTransition or assertPaymentTransition, so an
 * impossible move is refused in one place rather than at every call site.
 */

export const SUBSCRIPTION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CANCELLED",
  "EXPIRED",
  "SUSPENDED",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "INITIATED",
  "PENDING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Who caused the change, rather than smuggling operator actions into the same
 * enum as payment outcomes. SUSPENDED is deliberately not a payment result.
 */
export const SUBSCRIPTION_ACTIONS = [
  "START_TRIAL",
  "ACTIVATE",
  "RENEW",
  "PAYMENT_FAILED",
  "PAYMENT_RECOVERED",
  "SUSPEND",
  "REINSTATE",
  "CANCEL",
  "EXPIRE",
] as const;

export type SubscriptionAction = (typeof SUBSCRIPTION_ACTIONS)[number];

interface Transition {
  from: readonly SubscriptionStatus[];
  to: SubscriptionStatus;
  actions: readonly SubscriptionAction[];
  /** Only an operator may do this, never a payment callback. */
  operatorOnly?: boolean;
}

export const SUBSCRIPTION_TRANSITIONS: readonly Transition[] = [
  {
    from: ["TRIAL", "EXPIRED"],
    to: "PAYMENT_PENDING",
    actions: ["START_TRIAL", "ACTIVATE", "RENEW"],
  },
  {
    from: ["PAYMENT_PENDING"],
    to: "ACTIVE",
    // Only reachable once the gateway has confirmed the money.
    actions: ["ACTIVATE", "RENEW", "PAYMENT_RECOVERED"],
  },
  {
    from: ["PAYMENT_PENDING"],
    to: "PAYMENT_FAILED",
    actions: ["PAYMENT_FAILED"],
  },
  {
    from: ["ACTIVE", "PAYMENT_FAILED"],
    to: "PAST_DUE",
    actions: ["PAYMENT_FAILED"],
  },
  {
    from: ["PAST_DUE", "PAYMENT_FAILED"],
    to: "ACTIVE",
    actions: ["PAYMENT_RECOVERED", "RENEW"],
  },
  {
    from: ["PAST_DUE", "PAYMENT_FAILED", "PAYMENT_PENDING"],
    to: "EXPIRED",
    actions: ["EXPIRE"],
  },
  {
    from: ["ACTIVE", "TRIAL", "PAST_DUE", "PAYMENT_FAILED", "PAYMENT_PENDING", "EXPIRED"],
    to: "SUSPENDED",
    actions: ["SUSPEND"],
    operatorOnly: true,
  },
  {
    from: ["SUSPENDED"],
    to: "ACTIVE",
    actions: ["REINSTATE"],
    operatorOnly: true,
  },
  {
    from: ["TRIAL", "ACTIVE", "PAST_DUE", "PAYMENT_PENDING", "PAYMENT_FAILED", "EXPIRED", "SUSPENDED"],
    to: "CANCELLED",
    actions: ["CANCEL"],
    // Cancelling is a decision by the club or an operator, never something a
    // replayed gateway notification could cause.
    operatorOnly: true,
  },
];

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  INITIATED: ["PENDING", "COMPLETED", "FAILED", "CANCELLED"],
  PENDING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: ["REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export class InvalidTransitionError extends Error {
  readonly status = 409;
  constructor(
    readonly entity: "subscription" | "payment",
    readonly from: string,
    readonly to: string,
  ) {
    super(`A ${entity} cannot move from ${from} to ${to}.`);
    this.name = "InvalidTransitionError";
  }
}

export class ForbiddenTransitionError extends Error {
  readonly status = 403;
  constructor(action: SubscriptionAction) {
    super(`"${action}" may only be performed by an operator.`);
    this.name = "ForbiddenTransitionError";
  }
}

/** Resolves a subscription move, refusing anything not defined above. */
export function resolveSubscriptionTransition(
  from: SubscriptionStatus,
  action: SubscriptionAction,
): SubscriptionStatus {
  const match = SUBSCRIPTION_TRANSITIONS.find(
    (t) => t.from.includes(from) && t.actions.includes(action),
  );
  if (!match) throw new InvalidTransitionError("subscription", from, String(action));
  return match.to;
}

/**
 * Applies a subscription move, refusing one that a payment callback could
 * trigger. A gateway confirming money may activate, fail or recover a
 * subscription; it may never suspend, cancel or reinstate one.
 */
export function applySubscriptionTransition(
  from: SubscriptionStatus,
  action: SubscriptionAction,
  options: { actor: "system" | "operator" } = { actor: "system" },
): SubscriptionStatus {
  const match = SUBSCRIPTION_TRANSITIONS.find(
    (t) => t.from.includes(from) && t.actions.includes(action),
  );
  if (!match) throw new InvalidTransitionError("subscription", from, String(action));
  if (match.operatorOnly && options.actor !== "operator") {
    throw new ForbiddenTransitionError(action);
  }
  return match.to;
}

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  return (PAYMENT_TRANSITIONS[from] ?? []).includes(to);
}

export function assertPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): void {
  if (!canTransitionPayment(from, to)) {
    throw new InvalidTransitionError("payment", from, to);
  }
}

/** Statuses that still entitle a club to the product. */
export const ENTRITLED: readonly SubscriptionStatus[] = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "PAYMENT_PENDING",
];

/** Statuses where the product should stop working for that club. */
export const SUSPENDED_OR_GONE: readonly SubscriptionStatus[] = [
  "CANCELLED",
  "EXPIRED",
  "SUSPENDED",
  "PAYMENT_FAILED",
];

export function isEntitled(status: SubscriptionStatus): boolean {
  return ENTRITLED.includes(status);
}

/** The renewal date a new term would start from. */
export function nextRenewal(
  cycle: "MONTHLY" | "ANNUAL",
  from: Date,
): Date {
  const start = new Date(from);
  if (cycle === "ANNUAL") {
    start.setFullYear(start.getFullYear() + 1);
  } else {
    start.setMonth(start.getMonth() + 1);
  }
  return start;
}