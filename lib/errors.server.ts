
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


export const wrongState = (message: string) =>
  new ApiError(409, message, { code: "WRONG_STATE" });


export const moneyRule = (message: string) =>
  new ApiError(422, message, { code: "MONEY_RULE" });

export class RateLimitError extends Error {
  readonly status = 429;
  readonly body: { error: string; code?: string };

  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
    this.body = { error: message, code: "RATE_LIMITED" };
  }
}