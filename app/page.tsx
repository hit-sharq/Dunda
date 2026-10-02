'use client';

import dynamic from 'next/dynamic';

/**
 * The club app is a single authenticated surface: Clerk resolves the session and
 * wouter owns routing, both of which need `window`. Rendering it on the server
 * only produces a hydration mismatch, so it is loaded on the client.
 */
const DundaApp = dynamic(() => import('./dunda-app'), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-dvh place-items-center bg-[#0b0d0c] text-[#8b9490]">
      <span className="text-sm">Starting Dunda…</span>
    </div>
  ),
});

export default function Page() {
  return <DundaApp />;
}
