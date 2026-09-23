'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingBag,
  Grid2x2,
  ClipboardList,
  Clock3,
  Package,
  Sparkles,
  Users,
  CalendarDays,
  Settings,
  ChevronDown,
  LogOut,
} from 'lucide-react'
import { SignOutButton } from '@clerk/nextjs'

const navItems = [
  { label: 'Overview', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'POS', icon: ShoppingBag, href: '/dashboard/pos' },
  { label: 'Floor', icon: Grid2x2, href: '/dashboard/floor' },
  { label: 'Orders', icon: ClipboardList, href: '/dashboard/orders' },
  { label: 'Bar / Kitchen', icon: Clock3, href: '/dashboard/kitchen' },
  { label: 'Inventory', icon: Package, href: '/dashboard/inventory' },
  { label: 'Products', icon: Sparkles, href: '/dashboard/products' },
  { label: 'Customers', icon: Users, href: '/dashboard/customers' },
  { label: 'Reservations', icon: CalendarDays, href: '/dashboard/reservations' },
  { label: 'Events', icon: CalendarDays, href: '/dashboard/events' },
]

export default function Sidebar({ organizationId }: { organizationId: string }) {
  const pathname = usePathname()
  const [activeOrg, setActiveOrg] = useState('Skyline Entertainment')

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-[#172019] text-white lg:flex">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#d3f36b] text-[#172019]">
            <span className="text-lg font-black">d</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">dunda</span>
        </div>
      </div>
      <div className="px-3">
        <div className="mb-5 rounded-xl bg-white/8 p-3">
          <div className="text-[10px] uppercase tracking-widest text-[#88958b]">Organization</div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span>{activeOrg}</span>
            <ChevronDown className="size-4 text-[#8c998f]" />
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ label, icon: Icon, href }) => (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                pathname === href || pathname.startsWith(href + '/')
                  ? 'bg-[#d3f36b] font-semibold text-[#172019]'
                  : 'text-[#a4afa5] hover:bg-white/7 hover:text-white'
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mt-auto border-t border-white/10 p-3">
        <Link
          href="/dashboard/settings"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#a4afa5] hover:bg-white/7"
        >
          <Settings className="size-4" />
          Settings
        </Link>
        <SignOutButton
          redirectUrl="/"
          afterSignOutUrl="/"
        >
          {({ onClick }) => (
            <button
              onClick={onClick}
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#a4afa5] hover:bg-white/7"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          )}
        </SignOutButton>
      </div>
    </aside>
  )
}