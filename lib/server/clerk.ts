export function invitationFailureReason(error: unknown): string {
  const first = (
    error as {
      errors?: Array<{ code?: string; message?: string; long_message?: string }>;
    }
  )?.errors?.[0];
  const detail = first?.long_message ?? first?.message ?? first?.code;
  const text =
    detail ??
    (error instanceof Error ? error.message : "The invitation could not be sent.");
  return /already|exists|invited|duplicate|taken/i.test(text)
    ? "That address already has an account or a pending invitation."
    : text;
}

export function invitationRedirectUrl(): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/`;
}
