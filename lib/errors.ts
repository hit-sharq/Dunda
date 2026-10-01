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
  data?: { error?: string; code?: string; required?: string } | null;
  message?: string;
}

/**
 * What each permission is called on screen.
 *
 * The API works in keys such as create_order. A waiter being refused needs to
 * hear what is being asked for, not the key it is stored under.
 */
export const PERMISSION_LABELS: Record<string, string> = {
  view_pos: "Access the point of sale",
  create_order: "Take orders",
  modify_order: "Amend orders",
  update_ticket: "Work the station tickets",
  apply_discount: "Apply discounts",
  void_order: "Void orders",
  refund_payment: "Issue refunds",
  close_order: "Close orders",
  manage_payments: "Take payment",
  view_inventory: "View stock",
  adjust_inventory: "Adjust stock",
  approve_transfer: "Approve transfers",
  manage_products: "Manage the catalog",
  manage_prices: "Change prices",
  manage_staff: "Manage staff",
  manage_roles: "Manage roles",
  clock_shift: "Clock in and out",
  manage_events: "Manage events",
  manage_reservations: "Manage reservations",
  manage_vip: "Manage VIP guests",
  manage_floor: "Edit the floor",
  view_reports: "View reports",
  view_audit_logs: "View the audit log",
  manage_branches: "Manage branches",
};

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

  // Someone who is signed in but not set up yet. The message says what to do
  // and nothing about how the product is arranged: no mention of workspaces,
  // claiming, organizations, invitations or roles, because a stranger reading it
  // should not learn that any of those exist.
  if (code === "ACCOUNT_NOT_PROVISIONED") {
    return {
      title: "Your account isn't set up yet",
      detail:
        "Ask the person who runs this place to set your access up. You'll be able to get in as soon as they do.",
      tone: "warning",
      canRetry: false,
      code,
    };
  }

  if (status === 401) {
    // The app signs the person out rather than leaving a dead panel on screen,
    // so this is a fallback for the brief window before the redirect lands.
    return {
      title: "Session expired",
      detail: "Taking you back to sign in…",
      tone: "warning",
      canRetry: false,
      code,
    };
  }

  if (status === 403) {
    // The server names the permission it wanted; render that as something a
    // person can act on rather than a developer key.
    const required = e.data?.required as string | undefined;
    const label = required ? PERMISSION_LABELS[required] : undefined;
    return {
      title: label ? `Needs "${label}"` : "You don't have access",
      detail: label
        ? `Your role doesn't include this. Ask a manager for the "${label}" permission.`
        : "Your role doesn't include this. Ask a manager to grant you access.",
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

/**
 * A one-line message for a failed action.
 *
 * Failures from queries render through QueryNotice, but a mutation reports
 * through its own error handler and used to surface ApiError's message
 * directly, which reads "HTTP 403 Forbidden: ... Required: create_order".
 * That leaked HTTP status text and a permission key at somebody standing in
 * front of a customer.
 */
export function describeActionError(error: unknown, context?: { what?: string }): string {
  const info = describeError(error, context);
  if (info.canRetry) {
    return `${info.title}. ${info.detail}`;
  }
  return info.detail;
}
