import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, CalendarDays, ChevronDown,
  ChevronRight, CircleHelp, ClipboardList, CreditCard, Database, DoorOpen, Grid2X2,
  LayoutDashboard, Menu, Package, Plus, RefreshCw, Search, Settings2, ShoppingBag,
  SlidersHorizontal, Sparkles, Store,   Ticket, UserRound, Users, Utensils, WalletCards, X,
} from 'lucide-react';
import {
  getGetBranchFloorQueryKey, getGetBranchesQueryKey, getGetCategoriesQueryKey, getGetDashboardActivityQueryKey, getGetDashboardSummaryQueryKey,
  getGetInventoryAlertsQueryKey, getGetOrdersQueryKey, getGetProductsQueryKey, getGetReservationsQueryKey, getGetStaffQueryKey, getGetTabsQueryKey, getGetCustomersQueryKey, getGetEventsQueryKey, getGetSalesReportQueryKey, getGetAuditLogsQueryKey, getGetInventoryQueryKey,
  useAddTabItem,   useAdjustInventory, useCheckoutTab, useCreateCustomer, useCreateEvent, useCreateOrder,
  useCreateReservation, useCreateShift, useCreateStaff, useCreateTab, useCreateSupplier, useGetBranchFloor,
  useGetBranches, useGetCategories, useGetMe, useGetDashboardActivity, useGetDashboardSummary, useGetEvents, useGetInventory, useGetInventoryAlerts,
  useGetOrders, useGetProducts, useGetReservations, useGetStaff, useGetTabs, useUpdateOrderStatus,
  useGetTab, useGetCustomer, useGetCustomers, useGetEvent, useGetShifts, useGetSalesReport, useGetAuditLogs,
  type CheckoutInputMethod, type Customer, type Event, type Product, type StaffMember, type InventoryAlert,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { GlobalSearch, NotificationBell } from '@/components/chrome';
import { useRealtime } from '@/hooks/use-realtime';
import { useApiAuth } from '@/hooks/use-api-auth';
import { MoneyProvider, money } from '@/lib/money';
import { Pos as NewPos } from '@/pages/pos';
import { Products } from '@/pages/products';
import { FloorDesigner } from '@/pages/floor-designer';
import { ServiceBoard } from '@/pages/service-board';
import { Hq } from '@/pages/hq';
import NotFound from '@/pages/not-found';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';

const queryClient = new QueryClient();
// The repo-root .env uses NEXT_PUBLIC_ names, so accept either prefix.
const clerkPublishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  clerkPublishableKey,
);
// The Clerk frontend-API proxy only exists behind the deployment edge, where
// the API server mounts it in production. In development it must stay unset,
// otherwise Clerk tries to load clerk.js from a host that doesn't resolve.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL || undefined;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const todayLabel = new Intl.DateTimeFormat('en-KE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date());
const timeAgo = (stamp: string) => {
  const mins = Math.max(1, Math.floor((Date.now() - new Date(stamp).getTime()) / 60000));
  return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
};

function Logo({ dark = false }: { dark?: boolean }) {
  return <div className="flex items-center gap-2.5" data-testid="brand-dunda"><span className={`grid h-9 w-9 place-items-center rounded-xl font-display text-lg font-bold ${dark ? 'bg-[#f07a4b] text-[#182127]' : 'bg-[#f07a4b] text-[#182127]'}`}>D</span><span className={`font-display text-xl font-extrabold tracking-tight ${dark ? 'text-[#f6f0e4]' : 'text-[#182127]'}`}>dunda</span></div>;
}

function Button({ children, className = '', variant = 'primary', ...props }: { children: ReactNode; className?: string; variant?: 'primary' | 'outline' | 'ghost' | 'dark'; [key: string]: unknown }) {
  const variants = {
    primary: 'bg-[#f07a4b] text-[#182127] hover:bg-[#e96738]',
    outline: 'border border-[#dcd6c9] bg-[#fbf9f3] text-[#273239] hover:border-[#f07a4b] hover:text-[#b94d25]',
    ghost: 'text-[#66706f] hover:bg-[#ece8de] hover:text-[#182127]',
    dark: 'bg-[#27373d] text-[#f8f1e5] hover:bg-[#1d2b31]',
  };
  return <button type="button" className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

function Skeleton({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded-lg bg-[#e8e3d9] ${className}`} />; }
function QueryNotice({ loading, error, empty, onRetry }: { loading?: boolean; error?: boolean; empty?: boolean; onRetry?: () => void }) {
  if (loading) return <div className="grid gap-3 p-5"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-24 w-full" /></div>;
  if (error) return <div className="flex items-center justify-between gap-3 p-5 text-sm text-[#9b4930]" data-testid="status-error"><span>Couldn’t load this station data.</span><Button variant="outline" onClick={onRetry}><RefreshCw size={14} /> Retry</Button></div>;
  if (empty) return <div className="grid place-items-center gap-2 p-10 text-center text-sm text-[#69736f]" data-testid="status-empty"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f0ed] text-[#397f71]"><Sparkles size={18} /></div><p>Nothing on the floor yet.</p></div>;
  return null;
}

const nav = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/pos', label: 'Point of sale', icon: ShoppingBag },
  { href: '/floor', label: 'Floor', icon: Grid2X2 },
  { href: '/designer', label: 'Floor designer', icon: SlidersHorizontal },
  { href: '/orders', label: 'Orders', icon: ClipboardList },
  { href: '/bar', label: 'Bar / Kitchen', icon: Utensils },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/inventory', label: 'Inventory', icon: WalletCards },
  { href: '/staff', label: 'Staff', icon: UserRound },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/events', label: 'Events', icon: CalendarDays },
  { href: '/reservations', label: 'Reservations', icon: Ticket },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/hq', label: 'HQ', icon: Store },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

function Staff() {
  const staff = useGetStaff();
  const shifts = useGetShifts();
  return <div className="rise">
    <PageIntro eyebrow="Team / people" title="Your crew" detail="Staff members, their roles, and active shifts." action={<Button onClick={() => staff.refetch()} data-testid="button-refresh-staff"><RefreshCw size={15} /> Refresh</Button>} />
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <section className="surface rounded-2xl p-5">
        <h3 className="font-display text-xl font-bold mb-4">Staff members</h3>
        <QueryNotice loading={staff.isLoading} error={staff.isError} empty={!staff.isLoading && !staff.isError && !staff.data?.length} onRetry={() => staff.refetch()} />
        {staff.data?.map((s: StaffMember) => <div key={s.id} className="flex items-center justify-between border-b border-[#eee8de] py-3 last:border-0" data-testid={`row-staff-${s.id}`}>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#e6f0eb] text-[#438875]">{s.name.slice(0,1)}</div>
            <div>
              <p className="font-semibold">{s.name}</p>
              <p className="text-xs text-[#859087]">{s.role} · {s.email}</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-[#9b762c]">{s.status}</span>
        </div>)}
      </section>
      <section className="surface rounded-2xl p-5">
        <h3 className="font-display text-xl font-bold mb-4">Active shifts</h3>
        <QueryNotice loading={shifts.isLoading} error={shifts.isError} empty={!shifts.isLoading && !shifts.isError && !shifts.data?.length} onRetry={() => shifts.refetch()} />
        {shifts.data?.map((sh) => <div key={sh.id} className="border-b border-[#eee8de] py-3 last:border-0" data-testid={`row-shift-${sh.id}`}>
          <p className="font-semibold">{sh.staffId}</p>
          <p className="text-xs text-[#859087]">{sh.status}</p>
        </div>)}
      </section>
    </div>
  </div>;
}

function Customers() {
  const customers = useGetCustomers();
  return <div className="rise">
    <PageIntro eyebrow="People / customers" title="Your customers" detail="VIP members, visit history, and notes." action={<Link href="/customers/new" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#f07a4b] px-4 text-sm font-semibold text-[#182127] hover:bg-[#e96738]" data-testid="link-new-customer"><Plus size={16} /> Add customer</Link>} />
    <section className="surface rounded-2xl p-5">
      <QueryNotice loading={customers.isLoading} error={customers.isError} empty={!customers.isLoading && !customers.isError && !customers.data?.length} onRetry={() => customers.refetch()} />
      {customers.data?.map((c: Customer) => <div key={c.id} className="flex items-center justify-between border-b border-[#eee8de] py-3 last:border-0" data-testid={`row-customer-${c.id}`}>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#e8e3d9] text-[#182127]">{c.name.slice(0,1)}</div>
          <div>
            <p className="font-semibold">{c.name}</p>
            <p className="text-xs text-[#859087]">{c.phone ?? c.email ?? 'No contact'}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold ${c.vipLevel !== 'NONE' ? 'text-[#9b762c]' : 'text-[#859087]'}`}>{c.vipLevel}</span>
      </div>)}
    </section>
  </div>;
}

function Events() {
  const events = useGetEvents();
  return <div className="rise">
    <PageIntro eyebrow="Events / bookings" title="Upcoming events" detail="Special nights, reservations, and VIP packages." action={<Button onClick={() => events.refetch()} data-testid="button-refresh-events"><RefreshCw size={15} /> Refresh</Button>} />
    <section className="surface rounded-2xl p-5">
      <QueryNotice loading={events.isLoading} error={events.isError} empty={!events.isLoading && !events.isError && !events.data?.length} onRetry={() => events.refetch()} />
      {events.data?.map((e: Event) => <div key={e.id} className="border-b border-[#eee8de] py-4 last:border-0" data-testid={`card-event-${e.id}`}>
        <h3 className="font-display text-xl font-bold">{e.name}</h3>
        <p className="text-xs text-[#859087] mt-1">{e.date} · {e.startTime}–{e.endTime} · capacity: {e.capacity}</p>
        {e.description && <p className="text-sm text-[#65716b] mt-2">{e.description}</p>}
        <span className={`mt-2 inline-block w-fit text-xs font-semibold ${e.status === 'UPCOMING' ? 'text-[#3c7e69]' : 'text-[#9b762c]'}`}>{e.status}</span>
      </div>)}
    </section>
  </div>;
}

function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sales = useGetSalesReport({ dateFrom: thirtyDaysAgo, dateTo: today });
  const audit = useGetAuditLogs({ entity: undefined, action: undefined });
  return <div className="rise">
    <PageIntro eyebrow="Reports / analytics" title="Business at a glance" detail="Sales performance and recent audit trail." />
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <section className="surface rounded-2xl p-5">
        <h3 className="font-display text-xl font-bold mb-4">Sales report</h3>
        <QueryNotice loading={sales.isLoading} error={sales.isError} empty={!sales.isLoading && !sales.isError} onRetry={() => sales.refetch()} />
        {sales.data && <div className="space-y-3">
          <div className="flex items-center justify-between"><span className="text-sm text-[#748079]">Total revenue</span><span className="font-mono font-bold">{money(sales.data.totalRevenue)}</span></div>
          <div className="flex items-center justify-between"><span className="text-sm text-[#748079]">Total orders</span><span className="font-mono font-bold">{sales.data.totalOrders}</span></div>
          <div className="flex items-center justify-between"><span className="text-sm text-[#748079]">Average order value</span><span className="font-mono font-bold">{sales.data.averageOrderValue ? money(sales.data.averageOrderValue) : '—'}</span></div>
        </div>}
      </section>
      <section className="surface rounded-2xl p-5">
        <h3 className="font-display text-xl font-bold mb-4">Recent activity</h3>
        <QueryNotice loading={audit.isLoading} error={audit.isError} empty={!audit.isLoading && !audit.isError && !audit.data?.length} onRetry={() => audit.refetch()} />
        <div className="space-y-3">
          {audit.data?.slice(0, 10).map((log) => <div key={log.id} className="text-xs" data-testid={`row-audit-${log.id}`}>
            <span className="font-mono text-[#b65332]">{log.action}</span> · <span className="text-[#65716b]">{log.entity} {log.entityId}</span>
            <span className="block text-[#859087]">{new Date(log.createdAt).toLocaleString()}</span>
          </div>)}
        </div>
      </section>
    </div>
  </div>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const { signOut, openUserProfile } = useClerk();
  const branches = useGetBranches();
  const openOrders = useGetOrders();
  const openOrderCount = (openOrders.data ?? []).filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;
  const { user } = useUser();
  const me = useGetMe();

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    user?.username ||
    'Signed in';

  const roleLabel = me.data?.role ?? (me.data?.staff ? 'Staff' : 'No role assigned');

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?';

  const pulseSummary = useGetDashboardSummary();
  const shiftPulse = (() => {
    const d = pulseSummary.data;
    if (!d) return { summary: { occupancy: 0, label: 'Loading live count' } };
    const occupancy = d.totalTables > 0 ? Math.round((d.activeTables / d.totalTables) * 100) : 0;
    const clock = new Intl.DateTimeFormat('en-KE', { hour: 'numeric', minute: '2-digit' }).format(new Date());
    const label = d.totalTables === 0
      ? 'No tables configured'
      : `${d.activeTables} of ${d.totalTables} tables in use · ${clock}`;
    return { summary: { occupancy, label } };
  })();
  const signOutAndReturn = () => { void signOut({ redirectUrl: basePath || '/' }); setLocation('/'); };
  return <div className="app-noise min-h-[100dvh] bg-[#f5f1e8] md:flex">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-[#1c2a30] px-4 py-5 text-[#f6efe2] transition-transform md:static md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-9 flex items-center justify-between px-2"><Logo dark /><button onClick={() => setMobileOpen(false)} className="md:hidden" data-testid="button-close-menu"><X size={18} /></button></div>
      <div className="relative mb-6">
        <button onClick={() => setBranchOpen(!branchOpen)} className="flex w-full items-center justify-between rounded-xl bg-[#2a3c42] px-3 py-2.5 text-left" data-testid="button-branch-switcher"><span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-[#98aaa3]">Live branch</span><span className="mt-0.5 block truncate text-sm font-semibold">{branches.data?.[0]?.name ?? 'No branch assigned'}</span></span><ChevronDown size={15} className={branchOpen ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>
        {branchOpen && <div className="absolute left-0 right-0 top-14 z-20 max-h-64 overflow-y-auto rounded-xl border border-[#40535a] bg-[#26383e] p-1.5 shadow-xl">
          {!branches.data?.length && <p className="px-3 py-2 text-xs text-[#a9b8b2]">No branches yet.</p>}
          {branches.data?.map((branch) => <div key={branch.id} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm" data-testid={`button-branch-${branch.id}`}><span className="truncate">{branch.name}{branch.city ? <span className="ml-1 text-xs text-[#8b9a94]">{branch.city}</span> : null}</span><span className={branch.status === 'LIVE' ? 'text-xs text-[#91b9a5]' : 'text-xs text-[#8b9a94]'}>{branch.status}</span></div>)}
        </div>}
      </div>
      <nav className="grid gap-1" aria-label="Main navigation">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${location === href ? 'bg-[#f07a4b] font-semibold text-[#182127]' : 'text-[#aebdb6] hover:bg-[#2a3c42] hover:text-[#f6efe2]'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Orders' && openOrderCount > 0 && <span className="ml-auto rounded-full bg-[#db6950] px-1.5 py-0.5 text-[10px] text-[#fff4e8]">{openOrderCount}</span>}</Link>)}</nav>
       <div className="mt-auto grid gap-1 border-t border-[#35484d] pt-4"><button onClick={signOutAndReturn} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-[#aebdb6] hover:bg-[#2a3c42] hover:text-[#f6efe2]" data-testid="button-sign-out"><DoorOpen size={17} /> Sign out</button></div>
      <div className="mt-5 rounded-xl border border-[#385158] bg-[#22343a] p-3"><div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[.16em] text-[#90a69f]"><span>Table occupancy</span><span className="text-[#8bd1b2]">Live</span></div><div className="mb-2 flex items-end justify-between"><span className="font-display text-2xl font-bold">{pulseSummary.data ? `${shiftPulse.summary.occupancy}%` : '—'}</span><Activity size={17} className="text-[#f07a4b]" /></div><div className="h-1.5 overflow-hidden rounded-full bg-[#3b5054]"><div className="h-full rounded-full bg-[#f07a4b]" style={{ width: `${shiftPulse.summary.occupancy}%` }} /></div><p className="mt-2 text-[11px] text-[#8da29c]">{shiftPulse.summary.label}</p></div>
    </aside>
    {mobileOpen && <button onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[#142027]/45 md:hidden" aria-label="Close menu" data-testid="button-overlay-close" />}
    <main className="min-w-0 flex-1"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#e2dcd0] bg-[#f5f1e8]/95 px-4 backdrop-blur md:px-8"><div className="flex items-center gap-3"><Button variant="ghost" className="px-2 md:hidden" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu size={20} /></Button><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[#87908b]">{todayLabel}</p><h1 className="font-display text-xl font-bold tracking-tight text-[#182127]">{location === '/overview' ? 'Tonight at a glance' : nav.find((x) => x.href === location)?.label ?? (location === '/settings' ? 'Workspace settings' : 'Dunda')}</h1></div></div><div className="flex items-center gap-2"><GlobalSearch onNavigate={(href) => setLocation(href)} /><NotificationBell /><div className="hidden h-7 w-px bg-[#ded7ca] sm:block" /><button onClick={() => void openUserProfile()} className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-[#eae5da]" data-testid="button-user-menu"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#b8d1c7] text-xs font-bold text-[#21433f]">{initials}</span><span className="hidden text-left sm:block"><span className="block max-w-[16ch] truncate text-xs font-semibold">{displayName}</span><span className="block max-w-[16ch] truncate text-[10px] text-[#7e8983]">{roleLabel}</span></span></button></div></header><div className="mx-auto max-w-[1500px] p-4 md:p-8">{children}</div></main>
  </div>;
}

function PageIntro({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[.2em] text-[#8b938c]">{eyebrow}</p><h2 className="font-display text-3xl font-extrabold tracking-[-.04em] text-[#182127] md:text-4xl">{title}</h2><p className="mt-2 max-w-2xl text-sm text-[#69736f]">{detail}</p></div>{action}</div>;
}

function Metric({ label, value, note, trend, tone = 'plain' }: { label: string; value: string; note: string; trend?: 'up' | 'down'; tone?: 'plain' | 'coral' | 'green' }) {
  return <div className={`surface rounded-2xl p-4 md:p-5 ${tone === 'coral' ? 'bg-[#f07a4b] text-[#182127]' : tone === 'green' ? 'bg-[#dbe9e3]' : ''}`}><div className="mb-4 flex items-start justify-between"><span className={`text-xs font-semibold uppercase tracking-[.12em] ${tone === 'plain' ? 'text-[#89918b]' : 'opacity-70'}`}>{label}</span>{trend && <span className={`flex items-center gap-1 text-xs font-semibold ${trend === 'up' ? 'text-[#3e8a71]' : 'text-[#a64d39]'}`}>{trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{trend === 'up' ? 'on plan' : 'watch'}</span>}</div><div className="font-display text-3xl font-bold tracking-tight">{value}</div><p className={`mt-1 text-xs ${tone === 'plain' ? 'text-[#7e8882]' : 'opacity-70'}`}>{note}</p></div>;
}

function Overview() {
  const summary = useGetDashboardSummary();
  const activity = useGetDashboardActivity();
  const alerts = useGetInventoryAlerts();
  const reservations = useGetReservations();
  const s = summary.data;
  const series = s?.revenueSeries ?? [];
  const max = Math.max(...series.map((x) => x.value), 1);
  const occupancyPct = s && s.totalTables > 0 ? Math.round((s.activeTables / s.totalTables) * 100) : 0;
  return <div className="rise"><PageIntro eyebrow={`Command center / ${todayLabel}`} title="Run the room." detail={s?.branchName ? `${s.branchName} · live now` : 'Live shift'} action={<Link href="/pos" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#f07a4b] px-4 text-sm font-semibold text-[#182127] hover:bg-[#e96738]" data-testid="link-open-pos"><ShoppingBag size={16} /> Open POS <ChevronRight size={15} /></Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Revenue tonight" value={s ? money(s.revenue) : '—'} note={`${s?.orders ?? 0} completed orders`} tone="coral" /><Metric label="Open tabs" value={s ? String(s.activeTabs).padStart(2, '0') : '—'} note={s ? `${s.activeTables} tables currently active` : 'Loading live count'} /><Metric label="Average order" value={s ? money(s.averageOrderValue) : '—'} note="Across all payment methods" /><Metric label="Outstanding" value={s ? money(s.outstandingPayments) : '—'} note={s && s.outstandingPayments > 0 ? 'Needs attention before close' : 'Nothing outstanding'} /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]"><section className="surface rounded-2xl p-5 md:p-6"><div className="mb-6 flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#8b938c]">Revenue flow</p><h3 className="mt-1 font-display text-xl font-bold">This shift, by hour</h3></div><button className="flex items-center gap-1 rounded-lg border border-[#e3ddd2] px-2.5 py-1.5 text-xs font-semibold text-[#64706b]" data-testid="button-revenue-filter">Today <ChevronDown size={13} /></button></div><QueryNotice loading={summary.isLoading} error={summary.isError} onRetry={() => summary.refetch()} />{!summary.isLoading && !summary.isError && <><div className="flex h-[205px] items-end gap-1.5 border-b border-[#e9e3d9] pb-0 pt-3 sm:gap-3">{series.length === 0 && <p className="py-16 text-center text-sm text-[#859089]">No completed orders yet today.</p>}
        {series.length > 0 && series.map((point, i) => <div key={`${point.label}-${i}`} className="group flex h-full flex-1 flex-col justify-end gap-2"><div className="relative flex flex-1 items-end"><div className={`w-full rounded-t-md transition-all duration-300 ${i === series.length - 1 ? 'bg-[#f07a4b]' : 'bg-[#b9d5ca] group-hover:bg-[#82b8a2]'}`} style={{ height: `${Math.max(5, (point.value / max) * 100)}%` }}><span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#26383e] px-1.5 py-1 font-mono text-[9px] text-[#f8f1e5] group-hover:block">{money(point.value)}</span></div></div><span className="text-center font-mono text-[9px] text-[#929b94]">{point.label}</span></div>)}</div><div className="mt-4 flex flex-wrap gap-5 text-xs text-[#748079]"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#f07a4b]" /> Current hour</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#b9d5ca]" /> Completed hours</span></div></>}</section>
      <section className="surface rounded-2xl p-5 md:p-6"><div className="mb-5 flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#8b938c]">Room watch</p><h3 className="mt-1 font-display text-xl font-bold">Right now</h3></div><Link href="/floor" className="text-xs font-semibold text-[#4a8877]" data-testid="link-view-floor">View floor <ChevronRight className="inline" size={13} /></Link></div><div className="grid gap-3">{[{ label: 'Drinks', value: s ? money(s.drinkRevenue) : '—', color: '#f07a4b' }, { label: 'Food', value: s ? money(s.foodRevenue) : '—', color: '#70a99a' }, { label: 'Other', value: s ? money(s.otherRevenue) : '—', color: '#d9b46c' }].map((row) => <div key={row.label} className="flex items-center gap-3 rounded-xl bg-[#f5f1e8] p-3"><span className="h-9 w-1 rounded-full" style={{ background: row.color }} /><div className="flex-1"><span className="block text-sm font-semibold">{row.label}</span><span className="text-xs text-[#859089]">Revenue mix</span></div><span className="font-mono text-sm font-medium">{row.value}</span></div>)}</div><div className="mt-6 border-t border-[#e8e1d6] pt-4"><div className="flex items-center justify-between text-xs text-[#758079]"><span>Active tables</span><span className="font-mono font-medium text-[#273239]">{s?.activeTables ?? '—'} / {s?.totalTables ?? '—'}</span></div><div className="mt-2 h-2 rounded-full bg-[#e7e1d6]"><div className="h-full rounded-full bg-[#4b927d]" style={{ width: `${occupancyPct}%` }} /></div></div></section></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr_1fr]"><section className="surface rounded-2xl p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-bold">Live activity</h3><Link href="/orders" className="text-xs font-semibold text-[#4a8877]" data-testid="link-view-activity">See queue</Link></div><QueryNotice loading={activity.isLoading} error={activity.isError} empty={!activity.isLoading && !activity.isError && !activity.data?.length} onRetry={() => activity.refetch()} />{activity.data?.slice(0, 4).map((item) => <div key={item.id} className="flex gap-3 border-b border-[#eee8de] py-3 last:border-0" data-testid={`activity-${item.id}`}><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e6f0eb] text-[#438875]"><Activity size={14} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="truncate text-xs text-[#7b8780]">{item.detail}</p></div><span className="shrink-0 font-mono text-[10px] text-[#9aa19b]">{timeAgo(item.timestamp)}</span></div>)}</section><section className="surface rounded-2xl p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-bold">Low stock</h3><Link href="/inventory" className="text-xs font-semibold text-[#4a8877]" data-testid="link-view-inventory">View all</Link></div><QueryNotice loading={alerts.isLoading} error={alerts.isError} empty={!alerts.isLoading && !alerts.isError && !alerts.data?.length} onRetry={() => alerts.refetch()} />{alerts.data?.slice(0, 4).map((alert) => <div key={alert.id} className="flex items-center gap-3 border-b border-[#eee8de] py-3 last:border-0"><div className={`grid h-8 w-8 place-items-center rounded-lg ${alert.severity === 'OUT' ? 'bg-[#f9ddd5] text-[#a84d36]' : 'bg-[#f7ecd1] text-[#9b762c]'}`}><Package size={14} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{alert.name}</p><p className="text-xs text-[#7b8780]">{alert.category}</p></div><span className={`font-mono text-xs font-medium ${alert.severity === 'OUT' ? 'text-[#a84d36]' : 'text-[#9b762c]'}`}>{alert.stock} {alert.unit}</span></div>)}</section><section className="surface rounded-2xl p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-bold">Next reservations</h3><Link href="/reservations" className="text-xs font-semibold text-[#4a8877]" data-testid="link-view-reservations">Manage</Link></div><QueryNotice loading={reservations.isLoading} error={reservations.isError} empty={!reservations.isLoading && !reservations.isError && !reservations.data?.length} onRetry={() => reservations.refetch()} />{reservations.data?.slice(0, 4).map((res) => <div key={res.id} className="flex items-center gap-3 border-b border-[#eee8de] py-3 last:border-0"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#e4eceb] font-mono text-[10px] font-medium text-[#39796f]">{res.time}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{res.customer}</p><p className="text-xs text-[#7b8780]">{res.guests} guests · {res.table}</p></div><span className="rounded-full bg-[#e5f0ea] px-2 py-1 text-[10px] font-semibold text-[#46836f]">{res.status}</span></div>)}</section></div>
  </div>;
}

function Pos() {
  const products = useGetProducts();
  const tabs = useGetTabs({ status: 'OPEN' });
  const allTabs = useGetTabs();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedId, setSelectedId] = useState<string>();
  const [showNew, setShowNew] = useState(false);
  const [customer, setCustomer] = useState('');
  const [table, setTable] = useState('');
  const [payment, setPayment] = useState<CheckoutInputMethod>('MPESA');
  const [notice, setNotice] = useState('');
  const qc = useQueryClient();
  const createTab = useCreateTab();
  const addItem = useAddTabItem();
  const checkout = useCheckoutTab();
  const detail = allTabs.data?.find((t) => t.id === selectedId);
  const list = products.data ?? [];
  const cats = ['All', ...Array.from(new Set(list.map((p) => p.category)))];
  const filtered = list.filter((p) => (category === 'All' || p.category === category) && p.name.toLowerCase().includes(search.toLowerCase()));
  const openTab = detail ?? tabs.data?.find((tab) => tab.id === selectedId);
  const create = (event: FormEvent) => { event.preventDefault(); if (!customer || !table) return; createTab.mutate({ data: { customer, table } }, { onSuccess: (tab) => { setSelectedId(tab.id); setShowNew(false); setCustomer(''); setTable(''); qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: 'OPEN' }) }); } }); };
  const add = (p: Product) => { if (!selectedId) { setNotice('Open a tab first, then add items.'); return; } addItem.mutate({ tabId: selectedId, data: { productId: p.id, quantity: 1 } }, { onSuccess: (tab) => {       qc.setQueryData(getGetTabsQueryKey({ status: 'OPEN' }), tabs.data); qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: 'OPEN' }) }); setNotice(`${p.name} added`); } }); };
  const pay = () => { if (!openTab) return; checkout.mutate({ tabId: openTab.id, data: { method: payment, amount: openTab.total, reference: null } }, { onSuccess: (result) => { setNotice(`Receipt ${result.receiptNumber} closed successfully`); setSelectedId(undefined); qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: 'OPEN' }) }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } }); };
  return <div className="rise"><PageIntro eyebrow="Fast lane / POS" title="Take the order." detail="Tap a product to send it to the selected tab. Built for a busy counter and a 10-inch tablet." action={<Button onClick={() => setShowNew(true)} data-testid="button-new-tab"><Plus size={16} /> New tab</Button>} />
    {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-[#b8d5c9] bg-[#e5f1eb] px-4 py-3 text-sm text-[#397463]" data-testid="status-pos-success"><span>{notice}</span><button onClick={() => setNotice('')} data-testid="button-dismiss-notice"><X size={15} /></button></div>}
    <div className="grid gap-5 xl:grid-cols-[1fr_370px]"><section className="min-w-0"><div className="mb-4 flex gap-2 overflow-x-auto pb-1 mobile-scroll">{cats.map((cat) => <button key={cat} onClick={() => setCategory(cat)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${category === cat ? 'bg-[#27383e] text-[#f8f1e5]' : 'bg-[#e9e4d9] text-[#66726d] hover:bg-[#ded8cb]'}`} data-testid={`button-category-${cat.toLowerCase()}`}>{cat}</button>)}</div><label className="mb-5 flex h-11 items-center gap-2 rounded-xl border border-[#ded8cd] bg-[#fbf9f3] px-3 text-[#8c958f]"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm text-[#182127] outline-none placeholder:text-[#9ca39d]" placeholder="Search drinks, dishes, cover..." data-testid="input-search-products" /></label><QueryNotice loading={products.isLoading} error={products.isError} empty={!products.isLoading && !products.isError && !filtered.length} onRetry={() => products.refetch()} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{filtered.map((p) => <button key={p.id} onClick={() => add(p)} disabled={!p.available || addItem.isPending} className="surface group min-h-[142px] rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-45" data-testid={`button-product-${p.id}`}><div className="mb-6 flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl text-sm font-bold" style={{ background: `${p.accent}25`, color: p.accent }}>{p.category.slice(0, 1)}</span><span className="font-mono text-xs text-[#8a948d]">{p.unit}</span></div><span className="block text-sm font-semibold leading-tight">{p.name}</span><span className="mt-1 block font-mono text-sm font-medium text-[#b65332]">{money(p.price)}</span></button>)}</div></section><aside className="surface h-fit rounded-2xl p-4 md:sticky md:top-[88px]"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#8b938c]">Checkout rail</p><h3 className="font-display text-xl font-bold">Open tabs</h3></div><span className="rounded-full bg-[#f8e1d7] px-2 py-1 font-mono text-[10px] font-medium text-[#a94d30]">{tabs.data?.length ?? 0} live</span></div><div className="mb-4 grid gap-2">{tabs.isLoading ? <><Skeleton className="h-16" /><Skeleton className="h-16" /></> : tabs.isError ? <QueryNotice error onRetry={() => tabs.refetch()} /> : tabs.data?.length ? tabs.data.map((tab) => <button key={tab.id} onClick={() => setSelectedId(tab.id)} className={`rounded-xl border p-3 text-left ${selectedId === tab.id ? 'border-[#f07a4b] bg-[#fff2eb]' : 'border-[#e8e1d6] bg-[#f8f5ee] hover:border-[#cfc7b8]'}`} data-testid={`button-tab-${tab.id}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold">{tab.customer}</span><span className="font-mono text-[10px] text-[#8a948d]">#{tab.number}</span></div><div className="mt-1 flex items-center justify-between text-xs text-[#7f8a83]"><span>{tab.table} · {tab.items.length} items</span><span className="font-mono font-medium text-[#273239]">{money(tab.total)}</span></div></button>) : <QueryNotice empty />}</div>{openTab ? <div className="border-t border-[#e8e1d6] pt-4"><div className="mb-3 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#8b938c]">Tab #{openTab.number}</p><h4 className="font-display text-lg font-bold">{openTab.customer}</h4></div><span className="rounded-full bg-[#dceae3] px-2 py-1 text-[10px] font-semibold text-[#3d7c69]">{openTab.table}</span></div><div className="scroll-thin max-h-44 overflow-auto">{openTab.items.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-[#eee8de] py-2 text-sm"><span><b className="mr-2 font-mono text-xs text-[#b65332]">{item.quantity}×</b>{item.name}</span><span className="font-mono text-xs">{money(item.total)}</span></div>)}</div><div className="mt-3 grid gap-1 text-xs text-[#7e8982]"><div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{money(openTab.subtotal)}</span></div><div className="flex justify-between"><span>Service + tax</span><span className="font-mono">{money(openTab.serviceCharge + openTab.tax)}</span></div><div className="mt-2 flex justify-between border-t border-[#e5dfd4] pt-2 text-base font-bold text-[#182127]"><span>Total</span><span className="font-mono">{money(openTab.total)}</span></div></div><div className="mt-4 grid grid-cols-3 gap-1.5">{(['CASH', 'MPESA', 'CARD'] as CheckoutInputMethod[]).map((method) => <button key={method} onClick={() => setPayment(method)} className={`rounded-lg py-2 text-[10px] font-semibold ${payment === method ? 'bg-[#27383e] text-[#f7f1e6]' : 'bg-[#eee9df] text-[#7c8780]'}`} data-testid={`button-payment-${method.toLowerCase()}`}>{method === 'MPESA' ? 'M-Pesa' : method[0] + method.slice(1).toLowerCase()}</button>)}</div><Button className="mt-3 w-full" onClick={pay} disabled={checkout.isPending} data-testid="button-checkout">{checkout.isPending ? 'Closing tab…' : `Charge ${money(openTab.total)}`}</Button></div> : <div className="rounded-xl bg-[#f5f1e8] p-5 text-center text-sm text-[#748079]"><CreditCard className="mx-auto mb-2 text-[#6fa28e]" size={22} /><p>Select an open tab to see its check.</p></div>}</aside></div>
    {showNew && <Modal title="Open a new tab" onClose={() => setShowNew(false)}><form onSubmit={create} className="grid gap-4"><Field label="Customer name"><input required value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Nia" data-testid="input-tab-customer" /></Field><Field label="Table or seat"><input required value={table} onChange={(e) => setTable(e.target.value)} placeholder="e.g. T-14" data-testid="input-tab-table" /></Field><Button className="mt-2 w-full" disabled={createTab.isPending} data-testid="button-create-tab">{createTab.isPending ? 'Opening…' : 'Open tab'}</Button></form></Modal>}
  </div>;
}

function Floor() {
  const branches = useGetBranches();
  const [branchId, setBranchId] = useState('');
  const id = branchId || branches.data?.[0]?.id || '';
  const floor = useGetBranchFloor(id, { query: { enabled: Boolean(id), queryKey: getGetBranchFloorQueryKey(id) } });
  const sections = floor.data?.sections ?? [];
  const tableCount = sections.reduce((sum, section) => sum + section.tables.length, 0);
  const colors: Record<string, string> = { AVAILABLE: 'border-[#b9d9c9] bg-[#e4f1e9] text-[#397460]', OCCUPIED: 'border-[#efc2b3] bg-[#fff0e9] text-[#a84f32]', RESERVED: 'border-[#e7d39c] bg-[#fbf2d9] text-[#92702b]', PAYMENT_PENDING: 'border-[#e1b3b8] bg-[#f9e2e1] text-[#a54b57]', CLEANING: 'border-[#d3d7d6] bg-[#ecefed] text-[#6e7b75]' };
  return <div className="rise"><PageIntro eyebrow={`Live floor / ${tableCount} tables`} title="Know every seat." detail="A live read of the room. Tap a table to see its current check and handoff." action={<select value={id} onChange={(e) => setBranchId(e.target.value)} className="h-10 rounded-xl border border-[#dcd6c9] bg-[#fbf9f3] px-3 text-sm font-semibold outline-none" data-testid="select-floor-branch">{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>} /><div className="mb-5 flex flex-wrap gap-2">{Object.entries({ AVAILABLE: 'Available', OCCUPIED: 'Occupied', RESERVED: 'Reserved', PAYMENT_PENDING: 'Payment due', CLEANING: 'Resetting' }).map(([key, label]) => <span key={key} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${colors[key]}`}><i className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />{label}</span>)}</div><QueryNotice loading={floor.isLoading || branches.isLoading} error={floor.isError || branches.isError} empty={!floor.isLoading && !floor.isError && !sections.length} onRetry={() => floor.refetch()} /><div className="grid gap-5 lg:grid-cols-2">{sections.map((section) => <section key={section.id} className="surface rounded-2xl p-5"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#8b938c]">Section</p><h3 className="font-display text-xl font-bold">{section.name}</h3></div><span className="font-mono text-xs text-[#89938c]">{section.tables.length} seats</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{section.tables.map((t) => <button key={t.id} className={`min-h-[116px] rounded-xl border p-3 text-left transition-transform hover:-translate-y-0.5 ${colors[t.status]}`} data-testid={`button-table-${t.id}`}><div className="flex items-start justify-between"><span className="font-display text-xl font-bold">{t.name}</span><span className="font-mono text-[10px]">{t.seats} pax</span></div><span className="mt-5 block text-xs font-semibold">{t.status.replace('_', ' ')}</span><span className="mt-1 block font-mono text-sm font-medium">{t.total ? money(t.total) : '—'}</span></button>)}</div></section>)}</div></div>;
}

function Orders() {
  const orders = useGetOrders();
  const columns = [{ key: 'PENDING', label: 'New', color: 'bg-[#e4eceb]' }, { key: 'ACCEPTED', label: 'Accepted', color: 'bg-[#e8eee6]' }, { key: 'PREPARING', label: 'Preparing', color: 'bg-[#f7ecd1]' }, { key: 'READY', label: 'Ready', color: 'bg-[#f8ddd2]' }, { key: 'SERVED', label: 'Served', color: 'bg-[#e4e7df]' }];
  const activeCount = (orders.data ?? []).filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;
  return <div className="rise"><PageIntro eyebrow={`Service queue / ${activeCount} active`} title="Keep the pass moving." detail="Bar and kitchen orders, grouped by where they are in the rhythm." action={<Button variant="outline" onClick={() => orders.refetch()} data-testid="button-refresh-orders"><RefreshCw size={15} /> Refresh</Button>} /><QueryNotice loading={orders.isLoading} error={orders.isError} empty={!orders.isLoading && !orders.isError && !orders.data?.length} onRetry={() => orders.refetch()} /><div className="mobile-scroll grid min-w-[840px] grid-cols-4 gap-4">{columns.map((column) => { const items = orders.data?.filter((order) => order.status === column.key) ?? []; return <section key={column.key} className="min-h-[420px] rounded-2xl bg-[#ebe6dc] p-3"><div className="mb-3 flex items-center justify-between px-1"><span className="flex items-center gap-2 text-sm font-bold"><i className={`h-2.5 w-2.5 rounded-full ${column.color}`} />{column.label}</span><span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#f6f1e8] px-1.5 font-mono text-[10px] text-[#77827b]">{items.length}</span></div><div className="grid gap-3">{items.map((order) => <article key={order.id} className="surface rounded-xl p-4" data-testid={`card-order-${order.id}`}><div className="flex items-center justify-between"><span className="font-mono text-xs font-medium text-[#b65332]">#{order.number}</span><span className="text-xs text-[#8b958e]">{timeAgo(order.createdAt)}</span></div><div className="mt-2 flex items-center justify-between"><h3 className="font-display text-lg font-bold">{order.table}</h3><span className="rounded-full bg-[#e9eee8] px-2 py-1 text-[10px] font-semibold text-[#5f7c6e]">{order.status}</span></div><ul className="mt-3 border-t border-[#eee8de] pt-2 text-xs leading-6 text-[#65716b]">{order.items.map((item, i) => <li key={`${order.id}-${i}`} className="flex gap-2"><span className="font-mono text-[#b65332]">•</span>{item}</li>)}</ul></article>)}</div></section> })}</div></div>;
}

function Inventory() {
  const alerts = useGetInventoryAlerts();
  const products = useGetProducts();
  return <div className="rise"><PageIntro eyebrow="Stock room / visibility" title="Keep the bar ready." detail="Low-stock alerts and sellable catalog, in one clean handoff for the next shift." action={<Button variant="outline" onClick={() => { alerts.refetch(); products.refetch(); }} data-testid="button-refresh-inventory"><RefreshCw size={15} /> Sync stock</Button>} /><div className="grid gap-5 xl:grid-cols-[1.1fr_1.9fr]"><section className="surface rounded-2xl p-5"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#8b938c]">Needs action</p><h3 className="font-display text-xl font-bold">Low stock alerts</h3></div><span className="rounded-full bg-[#f8ddd2] px-2.5 py-1 font-mono text-xs text-[#a14c34]">{alerts.data?.length ?? 0}</span></div><QueryNotice loading={alerts.isLoading} error={alerts.isError} empty={!alerts.isLoading && !alerts.isError && !alerts.data?.length} onRetry={() => alerts.refetch()} />{alerts.data?.map((a) => <div key={a.id} className="flex items-center gap-3 border-b border-[#eee8de] py-3 last:border-0"><div className={`grid h-9 w-9 place-items-center rounded-xl ${a.severity === 'OUT' ? 'bg-[#f8ddd2] text-[#aa4d32]' : 'bg-[#f8edd4] text-[#97712a]'}`}><Package size={15} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.name}</p><p className="text-xs text-[#808b84]">{a.category} · min {a.minimum} {a.unit}</p></div><span className={`font-mono text-sm font-medium ${a.severity === 'OUT' ? 'text-[#aa4d32]' : 'text-[#97712a]'}`}>{a.stock} {a.unit}</span></div>)}</section><section className="surface rounded-2xl p-5"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#8b938c]">Sellable catalog</p><h3 className="font-display text-xl font-bold">What the team can ring</h3></div><span className="text-xs text-[#839087]">{products.data?.length ?? 0} products</span></div><QueryNotice loading={products.isLoading} error={products.isError} empty={!products.isLoading && !products.isError && !products.data?.length} onRetry={() => products.refetch()} /><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-[#e8e1d6] text-[10px] uppercase tracking-[.13em] text-[#909a92]"><th className="pb-3 font-medium">Product</th><th className="pb-3 font-medium">Category</th><th className="pb-3 font-medium">Price</th><th className="pb-3 font-medium">Stock</th><th className="pb-3 text-right font-medium">Status</th></tr></thead><tbody>{products.data?.map((p) => <tr key={p.id} className="border-b border-[#eee8de] last:border-0" data-testid={`row-product-${p.id}`}><td className="py-3 font-semibold">{p.name}</td><td className="py-3 text-[#7c8780]">{p.category}</td><td className="py-3 font-mono text-xs">{money(p.price)}</td><td className="py-3 font-mono text-xs">{p.stock} {p.unit}</td><td className="py-3 text-right"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${p.available ? 'bg-[#e2f0e8] text-[#3d7e68]' : 'bg-[#f5dfda] text-[#a24b36]'}`}>{p.available ? 'Available' : 'Hidden'}</span></td></tr>)}</tbody></table></div></section></div></div>;
}

function Reservations() {
  const reservations = useGetReservations();
  const [open, setOpen] = useState(false);
  const create = useCreateReservation();
  const qc = useQueryClient();
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); create.mutate({ data: { customer: String(data.get('customer')), phone: String(data.get('phone')), date: String(data.get('date')), time: String(data.get('time')), table: String(data.get('table')), guests: Number(data.get('guests')), notes: null } }, { onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: getGetReservationsQueryKey() }); } }); };
  return <div className="rise"><PageIntro eyebrow="Bookings / tonight" title="Make room for people." detail="Upcoming reservations, clearly handed to the floor team before doors open." action={<Button onClick={() => setOpen(true)} data-testid="button-new-reservation"><Plus size={16} /> New reservation</Button>} /><section className="surface overflow-hidden rounded-2xl"><div className="flex items-center justify-between border-b border-[#e8e1d6] p-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#8b938c]">Next 24 hours</p><h3 className="font-display text-xl font-bold">Reservation book</h3></div><button className="rounded-lg p-2 text-[#78837d] hover:bg-[#ede8de]" onClick={() => reservations.refetch()} data-testid="button-refresh-reservations"><RefreshCw size={16} /></button></div><QueryNotice loading={reservations.isLoading} error={reservations.isError} empty={!reservations.isLoading && !reservations.isError && !reservations.data?.length} onRetry={() => reservations.refetch()} />{reservations.data?.map((r) => <div key={r.id} className="grid gap-3 border-b border-[#eee8de] p-5 last:border-0 md:grid-cols-[110px_1.3fr_1fr_120px_120px] md:items-center" data-testid={`row-reservation-${r.id}`}><div><span className="block font-display text-xl font-bold">{r.time}</span><span className="font-mono text-[10px] uppercase text-[#8d9790]">{r.date}</span></div><div><p className="font-semibold">{r.customer}</p><p className="text-xs text-[#7c8780]">{r.phone}</p></div><div className="text-sm text-[#65716b]"><span className="font-medium text-[#273239]">{r.table}</span> · {r.guests} guests</div><span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold ${r.status === 'CONFIRMED' ? 'bg-[#e2f0e8] text-[#3c7e69]' : 'bg-[#f8ecd2] text-[#98732d]'}`}>{r.status}</span><button className="w-fit text-left text-xs font-semibold text-[#4a8877] md:text-right" data-testid={`button-reservation-${r.id}`}>View details <ChevronRight className="inline" size={13} /></button></div>)}</section>{open && <Modal title="Add reservation" onClose={() => setOpen(false)}><form onSubmit={submit} className="grid gap-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Customer"><input name="customer" required placeholder="Full name" data-testid="input-reservation-customer" /></Field><Field label="Phone"><input name="phone" required placeholder="+254 7..." data-testid="input-reservation-phone" /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Date"><input name="date" required type="date" data-testid="input-reservation-date" /></Field><Field label="Time"><input name="time" required type="time" data-testid="input-reservation-time" /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Table"><input name="table" required placeholder="T-08" data-testid="input-reservation-table" /></Field><Field label="Guests"><input name="guests" required min="1" type="number" placeholder="4" data-testid="input-reservation-guests" /></Field></div><Button className="mt-2 w-full" disabled={create.isPending} data-testid="button-save-reservation">{create.isPending ? 'Saving…' : 'Save reservation'}</Button></form></Modal>}</div>;
}

function Settings() {
  const settingsBranches = useGetBranches();
  return <div className="rise"><PageIntro eyebrow="Workspace / admin" title="Settings without the maze." detail="A calm place for organization preferences, branch controls, and team access." /><div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><section className="surface rounded-2xl p-6"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f9ddd2] text-[#a94e32]"><Store size={21} /></div><h3 className="mt-5 font-display text-2xl font-bold">Organization settings</h3><p className="mt-2 text-sm leading-6 text-[#6e7973]">Your organization is connected to Dunda. Fine-grain permissions, receipts, and integrations will live here.</p><div className="mt-6 rounded-xl bg-[#f5f1e8] p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[.1em] text-[#88918a]">Workspace status</span><span className="flex items-center text-xs font-semibold text-[#43826e] status-dot">{settingsBranches.data?.length ? 'Operational' : 'No branches yet'}</span></div>{settingsBranches.data?.length ? <ul className="mt-2 grid gap-1">{settingsBranches.data.map((b) => <li key={b.id} className="flex items-center justify-between text-sm"><span className="font-semibold">{b.name}</span><span className="text-xs text-[#7c8780]">{b.city} · {b.status}</span></li>)}</ul> : <p className="mt-2 text-sm text-[#6e7973]">No branches are configured yet.</p>}</div></section><section className="surface rounded-2xl p-6"><div className="mb-6 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#8b938c]">Configuration</p><h3 className="font-display text-xl font-bold">Branch controls</h3></div><SlidersHorizontal size={18} className="text-[#819088]" /></div>{['Receipt preferences', 'Staff roles & access', 'Payment methods', 'Service charge rules'].map((label, i) => <button key={label} className="flex w-full items-center justify-between border-b border-[#eee8de] py-4 text-left last:border-0" data-testid={`button-setting-${i}`}><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-[#859087]">Available in your next setup pass</span></span><ChevronRight size={16} className="text-[#a0aaa2]" /></button>)}</section></div></div>; }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-[#162329]/45 p-4"><div className="w-full max-w-md rounded-2xl border border-[#ded7ca] bg-[#fbf9f3] p-5 shadow-2xl md:p-6" role="dialog" aria-modal="true"><div className="mb-5 flex items-center justify-between"><h3 className="font-display text-2xl font-bold">{title}</h3><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#7f8982] hover:bg-[#eee9df]" data-testid="button-close-modal"><X size={18} /></button></div>{children}</div></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5 text-xs font-semibold text-[#5d6963]">{label}{children}</label>; }

function Auth({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return <div className="grid min-h-[100dvh] bg-[#1c2a30] lg:grid-cols-[1fr_1fr]"><div className="hidden flex-col justify-between p-10 lg:flex"><Logo dark /><div className="max-w-lg pb-10"><p className="font-mono text-xs uppercase tracking-[.2em] text-[#f07a4b]">The operating system for after hours</p><h1 className="mt-5 font-display text-6xl font-extrabold leading-[.93] tracking-[-.06em] text-[#f6efe2]">Own the night.<br /><span className="text-[#90c7b1]">Together.</span></h1><p className="mt-6 max-w-sm text-sm leading-6 text-[#9fb0a8]">Dunda brings the room, the rail, and the floor into one live view — so your team can move with the night.</p></div><div className="flex items-center gap-2 text-xs text-[#70847e]"><span className="h-2 w-2 rounded-full bg-[#83c4a6]" /> Live operations, without the noise</div></div><div className="grid place-items-center bg-[#f5f1e8] p-5 sm:p-10"><div className="w-full max-w-[440px]">{mode === 'sign-in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div></div></div>;
}

function Landing() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/overview" />;
  return <div className="app-noise min-h-[100dvh] bg-[#f5f1e8]"><header className="flex items-center justify-between px-5 py-5 md:px-10"><Logo /><div className="flex items-center gap-2"><Link href="/sign-in" className="rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#52605a] hover:bg-[#eae5da]" data-testid="link-landing-sign-in">Sign in</Link><Link href="/sign-up" className="rounded-xl bg-[#f07a4b] px-3.5 py-2.5 text-sm font-semibold text-[#182127] hover:bg-[#e96738]" data-testid="link-landing-sign-up">Start free</Link></div></header><main><section className="mx-auto grid max-w-[1420px] gap-12 px-5 pb-20 pt-14 md:px-10 md:pt-24 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pb-28"><div className="max-w-2xl"><p className="rise font-mono text-xs uppercase tracking-[.22em] text-[#b65332]">Built for the live shift</p><h1 className="rise delay-1 mt-6 font-display text-[clamp(3.5rem,8vw,7.7rem)] font-extrabold leading-[.88] tracking-[-.08em] text-[#182127]">The room<br /><span className="text-[#4f907d]">is yours.</span></h1><p className="rise delay-2 mt-8 max-w-lg text-lg leading-8 text-[#68736d]">Dunda is the club operating system for bars, lounges, and venues that move fast. One clear view of sales, tabs, tables, and the team keeping the night alive.</p><div className="rise delay-3 mt-9 flex flex-wrap gap-3"><Link href="/sign-up" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#f07a4b] px-5 text-sm font-bold text-[#182127] hover:bg-[#e96738]" data-testid="link-landing-primary">Open your venue <ChevronRight size={17} /></Link><Link href="/sign-in" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#d9d2c4] px-5 text-sm font-bold text-[#394841] hover:border-[#f07a4b]" data-testid="link-landing-secondary">Sign in <ArrowUpRight size={16} /></Link></div><div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#8a948d]"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#4f907d]" /> Live floor view</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#f07a4b]" /> Fast POS</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#d2ab63]" /> Shift-ready</span></div></div><div className="relative"><div className="absolute -inset-8 rounded-[3rem] bg-[#d9e6df] opacity-70 blur-3xl" /><div className="relative rotate-1 rounded-[1.7rem] border border-[#35484d] bg-[#203238] p-3 shadow-2xl"><div className="rounded-[1.25rem] bg-[#f6f1e8] p-4 md:p-6"><div className="flex items-center justify-between border-b border-[#e6dfd4] pb-5"><div><p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#909991]">Tonight at a glance</p><h3 className="mt-1 font-display text-xl font-bold">Run the room.</h3></div><span className="rounded-full bg-[#e1f0e8] px-2 py-1 text-[9px] font-bold text-[#3b7b68]">LIVE</span></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#f07a4b] p-3"><p className="text-[9px] uppercase tracking-[.1em] opacity-65">Revenue tonight</p><p className="mt-2 font-display text-2xl font-bold">KES 184,720</p><p className="mt-1 text-[10px] opacity-65">+12.4% vs last Tue</p></div><div className="rounded-xl bg-[#dcebe4] p-3"><p className="text-[9px] uppercase tracking-[.1em] text-[#60766c]">Open tabs</p><p className="mt-2 font-display text-2xl font-bold text-[#243b39]">18</p><p className="mt-1 text-[10px] text-[#658076]">7 tables active</p></div></div><div className="mt-4 rounded-xl border border-[#e7e0d5] bg-[#fbf9f3] p-3"><div className="mb-4 flex items-center justify-between"><span className="font-semibold text-xs">Revenue flow</span><span className="font-mono text-[9px] text-[#8b958e]">This shift</span></div><div className="flex h-24 items-end gap-2">{[32, 46, 38, 58, 51, 72, 87, 64, 92, 70].map((h, i) => <div key={i} className={`flex-1 rounded-t-sm ${i === 8 ? 'bg-[#f07a4b]' : 'bg-[#a9cbbd]'}`} style={{ height: `${h}%` }} />)}</div></div><p className="mt-4 text-center text-[9px] uppercase tracking-[.14em] text-[#9aa29c]">Sample interface</p></div></div><span className="absolute -bottom-5 -left-5 hidden rounded-xl bg-[#f07a4b] px-3 py-2 font-mono text-[10px] font-medium text-[#182127] shadow-lg sm:block">Illustrative preview</span></div></section><section className="border-y border-[#e3ddd1] bg-[#e9e4d9]"><div className="mx-auto grid max-w-[1420px] gap-px bg-[#dcd5c8] md:grid-cols-3">{[{ icon: Grid2X2, title: 'See the room', text: 'Tables, reservations, and payments in one live floor view.' }, { icon: WalletCards, title: 'Move the rail', text: 'Tap-to-ring POS that keeps service moving, not waiting.' }, { icon: BarChart3, title: 'Close with clarity', text: 'Shift summaries that tell you what happened while it was happening.' }].map(({ icon: Icon, title, text }) => <div key={title} className="bg-[#e9e4d9] p-7 md:p-10"><Icon size={22} className="mb-8 text-[#b65332]" /><h3 className="font-display text-xl font-bold">{title}</h3><p className="mt-2 max-w-xs text-sm leading-6 text-[#6e7972]">{text}</p></div>)}</div></section></main><footer className="mx-auto flex max-w-[1420px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-[#89928c] md:px-10"><Logo /><span>© {new Date().getFullYear()} Dunda</span></footer></div>;
}

function ProtectedRouter() {
  const { isLoaded, isSignedIn } = useAuth();
  useApiAuth();
  useRealtime(Boolean(isSignedIn));
  if (!isLoaded) return <div className="grid min-h-[100dvh] place-items-center bg-[#f5f1e8] text-sm text-[#68736d]">Loading your workspace…</div>;
  return isSignedIn ?     <AppShell><Switch><Route path="/overview" component={Overview} /><Route path="/pos" component={NewPos} /><Route path="/floor" component={Floor} /><Route path="/designer" component={FloorDesigner} /><Route path="/orders" component={Orders} /><Route path="/bar" component={() => <ServiceBoard station="bar" />} /><Route path="/kitchen" component={() => <ServiceBoard station="kitchen" />} /><Route path="/products" component={Products} /><Route path="/inventory" component={Inventory} /><Route path="/staff" component={Staff} /><Route path="/customers" component={Customers} /><Route path="/events" component={Events} /><Route path="/reservations" component={Reservations} /><Route path="/reports" component={Reports} /><Route path="/hq" component={Hq} /><Route path="/settings" component={Settings} /><Route component={NotFound} /></Switch></AppShell> : <Redirect to="/" />;
}

function Router() { return <Switch><Route path="/" component={Landing} /><Route path="/sign-in/*?" component={() => <Auth mode="sign-in" />} /><Route path="/sign-up/*?" component={() => <Auth mode="sign-up" />} /><Route component={ProtectedRouter} /></Switch>; }

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const nextUserId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== nextUserId) queryClient.clear();
    previousUserId.current = nextUserId;
  }), [addListener]);
  return null;
}

function App() {
  return <WouterRouter base={basePath}><ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={{ theme: shadcn, cssLayerName: 'clerk', options: { logoPlacement: 'inside', logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` }, variables: { colorPrimary: '#f07a4b', colorForeground: '#182127', colorMutedForeground: '#68736d', colorDanger: '#a84d36', colorBackground: '#fbf9f3', colorInput: '#ffffff', colorInputForeground: '#182127', colorNeutral: '#dcd6c9', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem' }, elements: { rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fbf9f3] rounded-2xl w-[440px] max-w-full overflow-hidden', card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none', headerTitle: 'text-[#182127]', headerSubtitle: 'text-[#68736d]', socialButtonsBlockButtonText: 'text-[#182127]', formFieldLabel: 'text-[#52605a]', footerActionLink: 'text-[#b65332]', footerActionText: 'text-[#68736d]', dividerText: 'text-[#68736d]', formFieldInput: 'text-[#182127] bg-white', formButtonPrimary: 'bg-[#f07a4b] text-[#182127]', main: 'bg-transparent' } }} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}><QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator /><ErrorBoundary resetKey={location.pathname}><MoneyProvider><Router /></MoneyProvider></ErrorBoundary></QueryClientProvider></ClerkProvider></WouterRouter>;
}

export default App;