'use client';

import dynamic from 'next/dynamic';

/**
 * Every club and console path renders the same surface.
 *
 * Dunda is a single authenticated application with its own client-side router, so
 * Next must not treat `/pos` or `/admin/audit` as missing pages. This optional
 * catch-all claims every path, and the app's own router decides what each one
 * shows — including answering not-found for a path that belongs to neither.
 *
 * The app is loaded on the client because Clerk resolves the session and the
 * router both need `window`; rendering it on the server only produces a
 * hydration mismatch.
 */
const DundaApp = dynamic(() => import('../dunda-app'), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-dvh place-items-center bg-[#0b0d0c] text-[#8b9490]">
      <span className="text-sm">Starting Dunda…</span>
    </div>
  ),
});

export default function CatchAll() {
  return <DundaApp />;
}
