/**
 * Turns a failed request into something a person can act on.
 *
 * Every screen previously showed the same "Couldn't load this station data."
 * regardless of the cause, and the message the API had already written was
 * discarded. The rules below are ordered most-specific first: a status that we
 * know how to explain beats the generic server text, and the server text beats
 * anything invented here.
 */

export interface FriendlyError {
  /** Short headline for the notice. */
  title: string;
  /** What the person should actually do next. */
  detail: string;
  tone: "error" | "warning" | "info";
  /** Whether retrying could plausibly succeed. */
  canRetry: boolean;
  /** The code the API sent, when there was one. */
  code?: string;
}

interface ErrorLike {
  status?: number;
  code?: string;
  data?: { error?: string; code?: string } | null;
  message?: string;
}

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === "object") return error as ErrorLike;
  return { message: String(error ?? "") };
}

export function describeError(
  error: unknown,
  context?: { what?: string },
): FriendlyError {
  const e = asErrorLike(error);
  const status = e.status;
  const code = e.data?.code ?? e.code;
  const serverMessage = e.data?.error;
  const what = context?.what;

  // An account with no Dunda staff record cannot be fixed by retrying.
  if (code === "STAFF_RECORD_REQUIRED") {
    return {
      title: "No workspace access",
      detail:
        "Your account is signed in, but it is not linked to a Dunda organization. Ask an organization owner to invite this account, then reload.",
      tone: "warning",
      canRetry: false,
      code,
    };
  }

  if (status === 401) {
    return {
      title: "Session expired",
      detail: "Sign in again to continue.",
      tone: "warning",
      canRetry: false,
      code,
    };
  }

  if (status === 403) {
    return {
      title: "You don't have access",
      detail: serverMessage
        ? `Ask a manager to grant you the right permissions. ${serverMessage}`
        : "This action needs a permission your role does not have. Ask a manager to grant it.",
      tone: "warning",
      canRetry: false,
      code,
    };
  }

  if (status === 404) {
    return {
      title: "Not found",
      detail: what
        ? `That ${what} no longer exists, or was deleted.`
        : "That record no longer exists, or was deleted.",
      tone: "info",
      canRetry: false,
      code,
    };
  }

  if (status === 409) {
    return {
      title: "Not allowed right now",
      detail: serverMessage ?? "The record is in a state that does not allow this.",
      tone: "warning",
      canRetry: false,
      code,
    };
  }

  if (status === 429) {
    return {
      title: "Too many requests",
      detail: "Wait a moment and try again.",
      tone: "warning",
      canRetry: true,
      code,
    };
  }

  if (code === "DATABASE_UNAVAILABLE" || status === 503) {
    return {
      title: "Can't reach the server",
      detail:
        "The service is temporarily unavailable. This is usually brief — try again in a moment.",
      tone: "error",
      canRetry: true,
      code,
    };
  }

  // A fetch that never reached the server at all.
  if (!status && e.message && /network|fetch|failed to fetch|load failed/i.test(e.message)) {
    return {
      title: "No connection",
      detail:
        "We could not reach the server. Check that it is running, then try again.",
      tone: "error",
      canRetry: true,
    };
  }

  if (status && status >= 500) {
    return {
      title: "Something went wrong on our side",
      detail: serverMessage ?? "The request failed unexpectedly. Try again in a moment.",
      tone: "error",
      canRetry: true,
      code,
    };
  }

  return {
    title: "Something went wrong",
    detail:
      serverMessage ??
      (what ? `We could not load this ${what}.` : "We could not complete that request."),
    tone: "error",
    canRetry: true,
    code,
  };
}

/**
 * A failed query is not the same as an empty one.
 *
 * A screen should only show "nothing here yet" when the request actually
 * succeeded and returned nothing. Anything else is a failure and must say so.
 */
export function isGenuinelyEmpty(
  query: { isError: boolean; data: unknown },
  isEmpty: (data: unknown) => boolean,
): boolean {
  if (query.isError) return false;
  if (query.data === undefined || query.data === null) return true;
  return isEmpty(query.data);
}
