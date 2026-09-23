'use client'

import { Search, Bell, ChevronDown, User, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useUser } from '@clerk/nextjs'

export default function Header({ organizationId }: { organizationId: string }) {
  const { user } = useUser()
  const { theme, setTheme } = useTheme()

  return (
    <header className="flex h-16 items-center justify-between border-b border-[#e1e5de] bg-white/70 px-4 sm:px-7 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="hidden text-sm font-semibold lg:block">
          {organizationId}
        </div>
        <div className="hidden items-center gap-2 rounded-lg border border-[#e1e5de] bg-white px-3 py-1.5 sm:flex">
          <Search className="size-4 text-[#9aa49d]" />
          <input
            type="search"
            placeholder="Search..."
            className="bg-transparent outline-none w-48 sm:w-64 text-sm text-[#172019] placeholder:text-[#9aa49d]"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex size-9 items-center justify-center rounded-lg text-[#566058] hover:bg-[#eef0ed] transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
        <button className="flex size-9 items-center justify-center rounded-lg text-[#566058] hover:bg-[#eef0ed] transition-colors relative">
          <Bell className="size-5" />
          <span className="absolute top-2 right-2 size-2 rounded-full bg-red-500" />
        </button>
        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[#172019] hover:bg-[#eef0ed] transition-colors"
          >
            <div className="size-8 rounded-full bg-[#d3f36b] flex items-center justify-center">
              <User className="size-4 text-[#172019]" />
            </div>
            <span className="hidden font-medium sm:block">{user?.fullName || user?.primaryEmailAddress?.emailAddress || 'User'}</span>
            <ChevronDown className="size-4 text-[#667068]" />
          </button>
        </div>
      </div>
    </header>
  )
}