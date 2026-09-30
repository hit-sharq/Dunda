/**
 * The order workflow, in one place.
 *
 * This previously lived only in the browser, so two clients could disagree about
 * what a ticket's next state was and any caller could skip a stage. The server
 * owns the transition table and both clients read their lane labels from the
 * order status enum in the shared spec.
 */
export const ORDER_STATUS_TRANSITIONS: Record<string, string[] | null> = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: ["PAYMENT_PENDING", "COMPLETED", "CANCELLED"],
  PAYMENT_PENDING: ["COMPLETED", "CANCELLED"],
  COMPLETED: null,
  CANCELLED: null,
};

export class InvalidTransitionError extends Error {
  readonly status = 409;
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`An order cannot move from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}
