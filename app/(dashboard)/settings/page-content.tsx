'use client'

import { useUser } from '@clerk/nextjs'

export default function PageContent({ organizationId }: { organizationId: string }) {
  const { user } = useUser()

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-[#172019]">Settings</h1>
        <p className="text-sm text-[#68736b]">Manage your workspace settings</p>
      </div>

      <div className="rounded-xl border border-[#e2e6df] bg-white p-6 space-y-6">
        <div className="border-b border-[#e2e6df] pb-6">
          <h2 className="text-lg font-medium text-[#172019] mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-full bg-[#d3f36b] flex items-center justify-center">
              <span className="text-2xl font-black text-[#172019]">
                {user?.fullName?.charAt(0) || user?.primaryEmailAddress?.emailAddress?.charAt(0) || 'U'}
              </span>
            </div>
            <div>
              <p className="font-medium text-[#172019]">{user?.fullName || 'User'}</p>
              <p className="text-sm text-[#68736b]">{user?.primaryEmailAddress?.emailAddress}</p>
              <p className="text-xs text-[#9aa49d] mt-1">Owner</p>
            </div>
          </div>
        </div>

        <div className="border-b border-[#e2e6df] pb-6">
          <h2 className="text-lg font-medium text-[#172019] mb-4">Organization</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-[#68736b] mb-1">Organization Name</label>
              <input
                type="text"
                defaultValue="Skyline Entertainment"
                className="w-full rounded-lg border border-[#d5dbd2] bg-white px-4 py-2.5 text-sm text-[#172019] focus:border-[#9aac51] focus:ring-2 focus:ring-[#9aac51]/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-[#68736b] mb-1">Currency</label>
              <select className="w-full rounded-lg border border-[#d5dbd2] bg-white px-4 py-2.5 text-sm text-[#172019] focus:border-[#9aac51] focus:ring-2 focus:ring-[#9aac51]/20 outline-none">
                <option value="KES">KES - Kenyan Shilling</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#68736b] mb-1">Timezone</label>
              <select className="w-full rounded-lg border border-[#d5dbd2] bg-white px-4 py-2.5 text-sm text-[#172019] focus:border-[#9aac51] focus:ring-2 focus:ring-[#9aac51]/20 outline-none">
                <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </div>

        <div className="border-b border-[#e2e6df] pb-6">
          <h2 className="text-lg font-medium text-[#172019] mb-4">Appearance</h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="rounded border-[#d5dbd2] text-[#172019] focus:ring-[#9aac51]" />
              <span className="text-sm text-[#172019]">Dark mode</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="rounded border-[#d5dbd2] text-[#172019] focus:ring-[#9aac51]" />
              <span className="text-sm text-[#172019]">Compact mode</span>
            </label>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-medium text-[#172019] mb-4">Danger Zone</h2>
          <button className="rounded-lg border border-[#fee2e2] bg-[#fef2f2] px-4 py-2.5 text-sm font-medium text-[#dc2626] hover:bg-[#fee2e2] transition-colors">
            Delete Workspace
          </button>
        </div>
      </div>
    </div>
  )
}