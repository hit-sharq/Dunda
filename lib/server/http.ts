import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/client";
import { ApiError } from "@/lib/errors.server";

/**
 * Everything a request handler needs in order to act as somebody: who they are,
 * which club they belong to, what role they hold and what that role permits.
 *
 * Resolution order matters. A staff row is the record that ties a Clerk account to
 * an organization, so it is looked up first. A person with no staff row is not a
 * stranger — they may be the platform operator, whose access is by environment
 * allow-list rather than by club membership.
 */
export interface Session {
  clerkUserId: string;
  organizationId: string | null;
  staffId: string | null;
  branchId: string | null;
  roleId: string | null;
  roleName: string | null;
  permissions: Set<string>;
  isOwner: boolean;
  isOperator: boolean;
}

/**
 * Platform operators are named by Clerk user id, never by role or by email.
 *
 * Both spellings of the variable are read because the deployment has used each of
 * them; an operator list that silently resolves to nobody would lock the platform
 * owner out of their own console.
 */
function operatorIds(): Set<string> {
  return new Set(
    `${process.env.PLATFORM_ADMIN_IDS ?? ""},${process.env.ADMIN_IDS ?? ""}`
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export async function resolveSession(): Promise<Session | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const staff = await prisma.dunda_staff.findFirst({
    where: { clerk_user_id: userId, status: "ACTIVE" },
    include: {
      dunda_roles: {
        include: {
          dunda_role_permissions: { include: { dunda_permissions: true } },
        },
      },
    },
  });

  if (!staff) {
    return {
      clerkUserId: userId,
      organizationId: null,
      staffId: null,
      branchId: null,
      roleId: null,
      roleName: null,
      permissions: new Set(),
      isOwner: false,
      isOperator: operatorIds().has(userId),
    };
  }

  const permissions = new Set(
    staff.dunda_roles.dunda_role_permissions.map((rp) => rp.dunda_permissions.name),
  );

  return {
    clerkUserId: userId,
    organizationId: staff.organization_id,
    staffId: staff.id,
    branchId: staff.branch_id,
    roleId: staff.role_id,
    roleName: staff.dunda_roles.name,
    permissions,
    isOwner: staff.dunda_roles.is_owner,
    isOperator: operatorIds().has(userId),
  };
}

/** Sign-in failed, or the session is gone. */
export class Unauthenticated extends Error {}

/** Signed in, but not attached to any club. */
export class NotProvisioned extends Error {}

/** Signed in and attached, but the role does not permit this action. */
export class Forbidden extends Error {
  constructor(readonly required: string) {
    super(`Your role does not include "${required}".`);
    this.name = "Forbidden";
  }
}

/**
 * Resolves the caller and asserts they belong to a club. Every club route starts
 * with this, so a route that forgets the assertion cannot accidentally serve the
 * platform console's data to a club, or one club's data to another.
 */
export async function requireSession(): Promise<Session> {
  const session = await resolveSession();
  if (!session) throw new Unauthenticated();
  if (!session.organizationId) throw new NotProvisioned();
  return session;
}

/** As above, but also asserts the named permission. */
export async function requirePermission(permission: string): Promise<Session> {
  const session = await requireSession();
  if (!session.permissions.has(permission)) throw new Forbidden(permission);
  return session;
}

/**
 * Asserts a fetched record belongs to the caller's club before it is used.
 *
 * Declared as an assertion so that after the call TypeScript knows the row is
 * present: a lookup that found nothing must not be carried on as if it had.
 */
export function assertSameOrg<T extends { organization_id: string }>(
  row: T | null | undefined,
  organizationId: string,
  what = "That record",
): asserts row is T {
  if (!row || row.organization_id !== organizationId) {
    throw new ApiError(404, `${what} no longer exists, or was deleted.`, {
      code: "NOT_FOUND",
    });
  }
}

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/**
 * Parses a JSON body against a schema. Nothing reaches a service unvalidated,
 * which is what keeps a caller from choosing its own totals or payment status.
 */
export async function parseBody<S extends ZodType>(schema: S, request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON", { code: "INVALID_BODY" });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(422, firstIssue(parsed.error), { code: "VALIDATION_FAILED" });
  }
  return parsed.data;
}

function firstIssue(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The request was not valid.";
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

/**
 * Wraps a handler so every failure leaves as the shape the client understands:
 * `{ error, code, required? }` with a status that matches the cause.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(error.body, { status: error.status });
  }
  if (error instanceof Unauthenticated) {
    return NextResponse.json(
      { error: "Sign in to continue.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }
  if (error instanceof NotProvisioned) {
    return NextResponse.json(
      {
        error: "Your account isn't set up yet.",
        code: "ACCOUNT_NOT_PROVISIONED",
      },
      { status: 403 },
    );
  }
  if (error instanceof Forbidden) {
    return NextResponse.json(
      {
        error: error.message,
        code: "FORBIDDEN",
        required: error.required,
      },
      { status: 403 },
    );
  }

  // A unique violation is a duplicate request, not a fault. The caller can retry
  // safely and will get the record that the first request created.
  if (isUniqueViolation(error)) {
    return NextResponse.json(
      { error: "That record already exists.", code: "DUPLICATE" },
      { status: 409 },
    );
  }

  console.error("[dunda] unhandled route failure", error);
  return NextResponse.json(
    { error: "The request could not be completed.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Appends the tenant scope to a where clause. Written as a function rather than
 * repeated inline so a new query has to be given an organizationId to compile.
 */
export function orgWhere<T extends Record<string, unknown>>(
  organizationId: string,
  where?: T,
): T & { organization_id: string } {
  return { ...where, organization_id: organizationId } as T & {
    organization_id: string;
  };
}
