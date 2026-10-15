'use client';

import dynamic from 'next/dynamic';


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