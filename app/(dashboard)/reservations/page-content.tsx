'use client'

export default function PageContent({ organizationId }: { organizationId: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#172019]">Reservations</h1>
        <p className="text-sm text-[#68736b]">Manage table reservations</p>
      </div>
      <div className="rounded-xl border border-[#e2e6df] bg-white p-8 text-center text-[#68736b]">
        Reservations coming soon
      </div>
    </div>
  )
}