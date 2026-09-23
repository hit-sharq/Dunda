'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ShoppingBag,
  Users,
  Package,
  DollarSign,
  TrendingUp,
  Clock3,
  Grid2x2,
  ClipboardList,
  Sparkles,
  CalendarDays,
  ArrowRight,
} from 'lucide-react'

const stats = [
  { label: 'Today\'s Revenue', value: 'KES 0', change: '+0%', icon: DollarSign, color: 'bg-[#eaf2c9] text-[#607a2d]' },
  { label: 'Active Orders', value: '0', change: '+0', icon: ClipboardList, color: 'bg-[#dbeafe] text-[#2563eb]' },
  { label: 'Tables Occupied', value: '0 / 0', change: '0%', icon: Grid2x2, color: 'bg-[#fef3c7] text-[#d97706]' },
  { label: 'Low Stock Items', value: '0', change: '0 critical', icon: Package, color: 'bg-[#fee2e2] text-[#dc2626]' },
]

const quickActions = [
  { label: 'New Order', icon: ShoppingBag, href: '/dashboard/pos', color: 'bg-[#172019] text-white' },
  { label: 'Floor Plan', icon: Grid2x2, href: '/dashboard/floor', color: 'bg-[#d3f36b] text-[#172019]' },
  { label: 'Inventory', icon: Package, href: '/dashboard/inventory', color: 'bg-[#3b82f6] text-white' },
  { label: 'Products', icon: Sparkles, href: '/dashboard/products', color: 'bg-[#8b5cf6] text-white' },
  { label: 'Customers', icon: Users, href: '/dashboard/customers', color: 'bg-[#ec4899] text-white' },
  { label: 'Reservations', icon: CalendarDays, href: '/dashboard/reservations', color: 'bg-[#f97316] text-white' },
]

const recentActivity = [
  { type: 'order', description: 'Order #ORD-001 created', time: '2 min ago', status: 'pending' },
  { type: 'payment', description: 'Payment received: KES 2,500', time: '15 min ago', status: 'success' },
  { type: 'inventory', description: 'Stock alert: Tusker Lager low', time: '1 hour ago', status: 'warning' },
  { type: 'reservation', description: 'New VIP reservation for Table 5', time: '2 hours ago', status: 'info' },
]

export default function DashboardContent({ organizationId }: { organizationId: string }) {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#172019]">Overview</h1>
          <p className="text-sm text-[#68736b]">Welcome back! Here's what's happening today.</p>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 text-sm font-medium text-[#566058] hover:bg-[#eef0ed] rounded-lg">Export</button>
          <button className="px-4 py-2 text-sm font-medium bg-[#172019] text-white rounded-lg hover:bg-[#172019]/90">New Order</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-[#e2e6df] bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#68736b]">{stat.label}</p>
                <p className="mt-1 text-2xl font-semibold text-[#172019]">{stat.value}</p>
                <p className="mt-1 text-xs text-[#9aac51]">{stat.change} vs last week</p>
              </div>
              <div className={`flex size-10 items-center justify-center rounded-xl ${stat.color}`}>
                <stat.icon className="size-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-[#e2e6df] bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#172019]">Quick Actions</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={`flex flex-col items-center gap-3 rounded-xl p-5 transition-colors ${action.color}`}
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-white/20">
                  <action.icon className="size-5" />
                </div>
                <span className="text-sm font-medium">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#e2e6df] bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#172019]">Recent Activity</h2>
            <Link href="/dashboard/activity" className="text-sm text-[#9aac51] flex items-center gap-1">
              View all <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {recentActivity.map((activity, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`flex size-8 items-center justify-center rounded-full ${
                  activity.status === 'success' ? 'bg-green-100 text-green-600' :
                  activity.status === 'warning' ? 'bg-yellow-100 text-yellow-600' :
                  activity.status === 'info' ? 'bg-blue-100 text-blue-600' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {activity.type === 'order' && <ShoppingBag className="size-4" />}
                  {activity.type === 'payment' && <DollarSign className="size-4" />}
                  {activity.type === 'inventory' && <Package className="size-4" />}
                  {activity.type === 'reservation' && <CalendarDays className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#172019]">{activity.description}</p>
                  <p className="text-xs text-[#9aa49d]">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#e2e6df] bg-white">
        <div className="border-b border-[#e2e6df] px-5 py-4">
          <h2 className="text-lg font-semibold text-[#172019]">Branch Performance</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-[#68736b] bg-[#fafbf9]">
                <th className="px-5 py-3 font-medium">Branch</th>
                <th className="px-5 py-3 font-medium">Revenue Today</th>
                <th className="px-5 py-3 font-medium">Orders</th>
                <th className="px-5 py-3 font-medium">Avg. Order</th>
                <th className="px-5 py-3 font-medium">Occupancy</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e6df]">
              <tr className="hover:bg-[#fafbf9]">
                <td className="px-5 py-4 font-medium text-[#172019]">Main Branch</td>
                <td className="px-5 py-4 text-[#172019]">KES 0</td>
                <td className="px-5 py-4 text-[#68736b]">0</td>
                <td className="px-5 py-4 text-[#68736b]">KES 0</td>
                <td className="px-5 py-4 text-[#68736b]">0%</td>
                <td className="px-5 py-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf2c9] text-[#607a2d] px-2.5 py-0.5 text-xs font-medium">
                    <span className="size-1.5 rounded-full bg-[#9aac51]" />
                    Open
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}