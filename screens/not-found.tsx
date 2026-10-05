import Link from 'next/link';

/**
 * A page that does not exist.
 *
 * This used to say "Did you forget to add the page to the router?" — a note to
 * whoever was building the app, printed to a club owner who followed a dead link.
 * It also doubled as the answer for a signed-in person who is not an operator,
 * which told them the page was missing when what actually happened was that the
 * page exists and they may not see it. Those are different answers and they are
 * now separate screens.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-6 text-center">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[.18em] text-[var(--app-faint)]">
          404
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold text-[var(--app-ink)]">
          There is no page here
        </h1>
        <p className="mt-2 text-sm text-[var(--app-ink-soft)]">
          The address may be mistyped, or the screen may have been renamed. Nothing
          is wrong with your account.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/overview"
            className="inline-flex min-h-10 items-center rounded-xl bg-[var(--app-gold)] px-4 text-sm font-semibold text-[var(--app-ink)] hover:opacity-90"
            data-testid="link-back-overview"
          >
            Back to the dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center rounded-xl border border-[var(--app-line)] px-4 text-sm font-semibold text-[var(--app-ink-soft)] hover:bg-[var(--app-raised)]"
          >
            Start again
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown to somebody who is signed in but may not see the console.
 *
 * Deliberately not the same screen as a missing page: the page is there, and
 * saying otherwise would leave a club owner hunting for a link problem they cannot
 * fix. It also gives the operator console as a next step for the person who
 * genuinely should have it, which is usually how somebody reaches this at all.
 */
export function NotAnOperator() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-6 text-center">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[.18em] text-[var(--app-faint)]">
          Restricted
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold text-[var(--app-ink)]">
          The admin console isn't open to you
        </h1>
        <p className="mt-2 text-sm text-[var(--app-ink-soft)]">
          This is the platform side of Dunda, where every club and its billing are
          managed. Club staff use their own screens instead.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/overview"
            className="inline-flex min-h-10 items-center rounded-xl bg-[var(--app-gold)] px-4 text-sm font-semibold text-[var(--app-ink)] hover:opacity-90"
            data-testid="link-back-overview"
          >
            Back to the dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
