

export interface FriendlyError {
  
  title: string;
  
  detail: string;
  tone: "error" | "warning" | "info";
  
  canRetry: boolean;
  
  code?: string;
}

interface ErrorLike {
  status?: number;
  code?: string;
  data?: {
    error?: string;
    code?: string;
    required?: string;
    module?: string;
    planName?: string | null;
  } | null;
  message?: string;
}


export const PERMISSION_LABELS: Record<string, string> = {
  view_pos: "Access the point of sale",
  create_order: "Take orders",
  modify_order: "Amend orders",
  update_ticket: "Work the station tickets",
  apply_discount: "Apply discounts",
  void_order: "Void orders",
  refund_payment: "Issue refunds",
  approve_refunds: "Approve refunds over the limit",
  manage_disputes: "Handle card disputes and chargebacks",
  manage_risk: "Manage the blocklist and risk rules",
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

const MODULE_LABELS: Record<string, string> = {
  inventory: "Inventory and low-stock alerts",
  reservations: "Reservations and upcoming bookings",
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
  const moduleKey = e.data?.module;
  const moduleName = moduleKey
    ? MODULE_LABELS[moduleKey] ?? moduleKey.replaceAll("_", " ")
    : undefined;

  
  
  
  
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
    
    
    return {
      title: "Session expired",
      detail: "Taking you back to sign in…",
      tone: "warning",
      canRetry: false,
      code,
    };
  }

  if (code === "MODULE_NOT_IN_PLAN") {
    const module = moduleName ?? "this feature";
    const planName = e.data?.planName;
    return {
      title: `${module} isn't available on ${planName ?? "this plan"}`,
      detail: `The club's ${planName ?? "current"} plan doesn't include ${module}. Ask a club owner to upgrade the subscription. Your role permissions are not the cause.`,
      tone: "warning",
      canRetry: false,
      code,
    };
  }

  if (code === "MODULE_DISABLED") {
    const module = moduleName ?? "this feature";
    return {
      title: `${module} is switched off for this club`,
      detail: `A platform administrator has disabled ${module}. Contact the platform administrator to turn it back on. Your role permissions are not the cause.`,
      tone: "warning",
      canRetry: false,
      code,
    };
  }

  if (status === 403) {
    
    
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


export function isGenuinelyEmpty(
  query: { isError: boolean; data: unknown },
  isEmpty: (data: unknown) => boolean,
): boolean {
  if (query.isError) return false;
  if (query.data === undefined || query.data === null) return true;
  return isEmpty(query.data);
}


export function describeActionError(error: unknown, context?: { what?: string }): string {
  const info = describeError(error, context);
  if (info.canRetry) {
    return `${info.title}. ${info.detail}`;
  }
  return info.detail;
}