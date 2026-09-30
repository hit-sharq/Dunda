/**
 * Turns a failed request into something a person can act on.
 *
 * Mobile previously rendered one generic "Couldn't load this data." for every
 * failure and discarded the message the API had already written.
 */

interface ErrorLike {
  status?: number;
  message?: string;
}

export interface FriendlyError {
  title: string;
  detail: string;
  canRetry: boolean;
}

export function describeError(error: unknown, apiMessage?: string): FriendlyError {
  const e = (error && typeof error === "object" ? error : {}) as ErrorLike;
  const status = e.status;

  if (status === 401) {
    return {
      title: "Session expired",
      detail: "Sign in again to continue.",
      canRetry: false,
    };
  }
  if (status === 403) {
    return {
      title: "No access",
      detail: apiMessage ?? "Your role does not include this. Ask a manager to grant it.",
      canRetry: false,
    };
  }
  if (status === 404) {
    return { title: "Not found", detail: "That record no longer exists.", canRetry: false };
  }
  if (status === 503) {
    return {
      title: "Can't reach the server",
      detail: "The service is briefly unavailable. Try again in a moment.",
      canRetry: true,
    };
  }
  if (!status && e.message && /network|fetch|failed to fetch|load failed/i.test(e.message)) {
    return {
      title: "No connection",
      detail: "We could not reach the server. Check that it is running, then try again.",
      canRetry: true,
    };
  }
  if (status && status >= 500) {
    return {
      title: "Something went wrong",
      detail: apiMessage ?? "That request failed unexpectedly. Try again in a moment.",
      canRetry: true,
    };
  }
  return {
    title: "Something went wrong",
    detail: apiMessage ?? "We could not complete that request.",
    canRetry: true,
  };
}
