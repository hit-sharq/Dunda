/**
 * An error that already knows the status and the message a caller should read.
 *
 * Thrown by services when a request is refused for a reason the caller can act on:
 * a tab that has already been closed, a discount above what the role may approve,
 * a payment that would exceed the outstanding balance. The route wrapper turns it
 * into a response without inventing a message of its own.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: { error: string; code?: string; required?: string };

  constructor(
    status: number,
    message: string,
    extra: { code?: string; required?: string } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = { error: message, ...extra };
  }
}

export const notFound = (what: string) =>
  new ApiError(404, `${what} no longer exists, or was deleted.`, { code: "NOT_FOUND" });

export const conflict = (message: string) =>
  new ApiError(409, message, { code: "CONFLICT" });

export const invalid = (message: string) =>
  new ApiError(422, message, { code: "VALIDATION_FAILED" });

/** Refused because the tab is not in a state that allows this. */
export const wrongState = (message: string) =>
  new ApiError(409, message, { code: "WRONG_STATE" });

/** Refused because of a money rule, e.g. paying more than is owed. */
export const moneyRule = (message: string) =>
  new ApiError(422, message, { code: "MONEY_RULE" });
