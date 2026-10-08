'use client';

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Building2, CalendarDays, ChevronDown, CircleDot, Layers, LifeBuoy, Repeat,
  ChevronLeft, ChevronRight, CircleHelp, ClipboardList, CreditCard, Database, DoorOpen, Grid2X2,
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
  useGetAdminOrganizations, useGetAdminSummary,
  type CheckoutInputMethod, type Customer, type Event, type Product, type StaffMember, type InventoryAlert,
} from '@/lib/api-client-react/src';
import { ErrorBoundary } from '@/components/error-boundary';
import { GlobalSearch, NotificationBell } from '@/components/chrome';
import { useLiveRefresh } from '@/hooks/use-live-refresh';
import { usePaymentAttempt } from '@/hooks/use-payment-attempt';
import {
  useSubscriptionPayment,
  useRequestSubscriptionPayment,
} from '@/hooks/use-subscription-payment';
import { useApiAuth } from '@/hooks/use-api-auth';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { MoneyProvider, money } from '@/lib/money';
import { QueryNotice } from '@/components/query-notice';
import { StaffManager } from '@/screens/staff-manager';
import { Clients as OperatorClients } from '@/admin/clients';
import { ClientDetail as OperatorClientDetail } from '@/admin/client-detail';
import { NewClient as OperatorNewClient } from '@/admin/new-client';
import { PlatformStaff as OperatorPeople } from '@/admin/platform-staff';
import { AuditTrail as OperatorAudit } from '@/admin/audit-trail';
import { Plans as OperatorPlans } from '@/admin/plans';
import { Subscriptions as OperatorSubscriptions } from '@/admin/subscriptions';
import { Support as OperatorSupport } from '@/admin/support';
import { System as OperatorSystem } from '@/admin/system';
import { Overview as OperatorOverview } from '@/admin/overview';
import { Billing as OperatorBilling } from '@/admin/billing';
import { PERMISSION_LABELS } from '@/lib/errors';
import { Skeleton } from '@/components/ui';
import { Pos as NewPos } from '@/screens/pos';
import { Products } from '@/screens/products';
import { FloorDesigner } from '@/screens/floor-designer';
import { ServiceBoard } from '@/screens/service-board';
import { Hq } from '@/screens/hq';
import NotFound, { NotAnOperator } from '@/screens/not-found';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';

const VENDOR_URL = "https://www.lumyn.co.ke/";
const VENDOR_NAME = "Lumyn Technologies";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
     
      refetchOnWindowFocus: true,
    
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (typeof status === 'number' && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
  },
});

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
function resolveClerkPublishableKey() {
  const hostname =
    typeof window === 'undefined' ? 'localhost' : window.location.hostname;
  return publishableKeyFromHost(hostname, clerkPublishableKey);
}

const clerkProxyUrl = process.env.NEXT_PUBLIC_CLERK_PROXY_URL || undefined;
const basePath = '';
function logoImageUrl() {
  const origin =
    typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${basePath}/logo.svg`;
}
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
  return <div className="flex items-center gap-2.5" data-testid="brand-dunda"><span className={`grid h-9 w-9 place-items-center rounded-xl font-display text-lg font-bold ${dark ? 'bg-[var(--app-gold)] text-[var(--app-ink)]' : 'bg-[var(--app-gold)] text-[var(--app-ink)]'}`}>D</span><span className={`font-display text-xl font-extrabold tracking-tight ${dark ? 'text-[var(--app-warn-soft)]' : 'text-[var(--app-ink)]'}`}>dunda</span></div>;
}

function Button({ children, className = '', variant = 'primary', ...props }: { children: ReactNode; className?: string; variant?: 'primary' | 'outline' | 'ghost' | 'dark'; [key: string]: unknown }) {
  const variants = {
    primary: 'bg-[var(--app-gold)] text-[var(--app-ink)] hover:bg-[var(--app-gold)]',
    outline: 'border border-[var(--app-line)] bg-[var(--app-surface)] text-[var(--app-ink)] hover:border-[var(--app-gold)] hover:text-[var(--app-gold)]',
    ghost: 'text-[var(--app-faint)] hover:bg-[var(--app-warn-soft)] hover:text-[var(--app-ink)]',
    dark: 'bg-[var(--app-info)] text-[var(--app-chrome-ink)] hover:bg-[var(--app-info)]',
  };
  return <button type="button" className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`} {...props}>{children}</button>;
}



const nav: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** The permission that opens this screen, if it needs one. */
  permission?: string;
  /** Never rendered unless /me says the caller may. */
  operatorOnly?: boolean;
  /** Which part of the job this screen serves. Drives the grouped navigation. */
  group?: 'Tonight' | 'Selling' | 'Running the club' | 'Numbers' | 'Platform';
}> = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard, group: 'Tonight' },
  { href: '/floor', label: 'Floor', icon: Grid2X2, permission: 'view_pos', group: 'Tonight' },
  { href: '/orders', label: 'Orders', icon: ClipboardList, permission: 'view_orders', group: 'Tonight' },
  { href: '/bar', label: 'Bar / Kitchen', icon: Utensils, permission: 'update_ticket', group: 'Tonight' },
  { href: '/pool', label: 'Pool', icon: CircleDot, permission: 'manage_pool', group: 'Tonight' },
  { href: '/pos', label: 'Point of sale', icon: ShoppingBag, permission: 'view_pos', group: 'Selling' },
  { href: '/products', label: 'Products', icon: Package, permission: 'manage_products', group: 'Selling' },
  { href: '/inventory', label: 'Inventory', icon: WalletCards, permission: 'view_inventory', group: 'Selling' },
  { href: '/designer', label: 'Floor designer', icon: SlidersHorizontal, permission: 'manage_floor', group: 'Selling' },
  { href: '/reservations', label: 'Reservations', icon: Ticket, permission: 'manage_reservations', group: 'Running the club' },
  { href: '/customers', label: 'Customers', icon: Users, permission: 'manage_customers', group: 'Running the club' },
  { href: '/events', label: 'Events', icon: CalendarDays, permission: 'manage_events', group: 'Running the club' },
  { href: '/staff', label: 'Staff', icon: UserRound, permission: 'manage_staff', group: 'Running the club' },
  { href: '/reports', label: 'Reports', icon: BarChart3, permission: 'view_reports', group: 'Numbers' },
  { href: '/hq', label: 'HQ', icon: Store, permission: 'view_reports', group: 'Numbers' },
  { href: '/settings', label: 'Settings', icon: Settings2, permission: 'manage_roles', group: 'Numbers' },
  {
    href: '/admin',
    label: 'Operator',
    icon: Store,
    group: 'Platform',
    /** Shown only when /me says so, so it is never present in a club user's page. */
    operatorOnly: true,
  },
] as const;

function Staff() {
  const staff = useGetStaff();
  const shifts = useGetShifts();
  return <div className="rise">
    <PageIntro eyebrow="Team / people" title="Your crew" detail="Add somebody, give them a role, and they're linked the moment they sign up with that email." />
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <StaffManager />
      <section className="surface rounded-2xl p-5">
        <h3 className="font-display text-xl font-bold mb-4">Shifts today</h3>
        <QueryNotice loading={shifts.isLoading} error={shifts.error} what="shifts" emptyTitle="No shifts recorded today." emptyHint="Shifts appear when staff clock in." empty={!shifts.isLoading && !shifts.isError && !shifts.data?.length} onRetry={() => shifts.refetch()} />
        <ul>
          {shifts.data?.map((s: { id: string; staffId: string | null; status: string; clockInAt?: string | null; clockOutAt?: string | null }) => {
            const person = staff.data?.find((m: StaffMember) => m.id === s.staffId);
            return <li key={s.id} className="flex items-center justify-between border-b border-[var(--app-line-soft)] py-3 last:border-0">
              <div><p className="font-semibold">{person?.name ?? 'Unassigned'}</p><p className="text-xs text-[var(--app-muted)]">{s.clockInAt ? `In since ${new Date(s.clockInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not clocked in'}</p></div>
              <span className="text-xs font-semibold text-[var(--app-success)]">{s.status}</span>
            </li>;
          })}
        </ul>
      </section>
    </div>
  </div>;
}

/**
 * Adding a guest by hand.
 *
 * The customers list has an "Add customer" button that pointed at this route
 * before it existed, so it 404'd. Guests normally arrive through a reservation
 * or the till, which is why this was never needed — but a bouncer taking a
 * name at the door has nowhere else to put it, and a name they typed has to go
 * somewhere.
 */
function NewCustomer() {
  const me = useGetMe();
  const create = useCreateCustomer();
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });

  return <div className="rise max-w-lg">
    <PageIntro
      eyebrow="People / customers"
      title="Add a customer"
      detail="For a guest who walks in and gives a name. Anything they spend afterwards attaches to this record."
      action={<Link href="/customers" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--app-line)] px-4 text-sm font-semibold text-[var(--app-ink-soft)] hover:bg-[var(--app-raised)]" data-testid="link-back-customers">
        <ChevronLeft size={16} /> Back
      </Link>}
    />
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          {
            data: {
              name: form.name.trim(),
              phone: form.phone.trim() || null,
              email: form.email.trim() || null,
              notes: form.notes.trim() || null,
            },
          },
          { onSuccess: () => setLocation('/customers') },
        );
      }}
      className="surface grid gap-4 rounded-2xl p-5 md:p-6"
      data-testid="form-new-customer"
    >
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-[var(--app-ink)]">Name</span>
        <input
          required
          autoFocus
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Nia Wanjiku"
          className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-ink)]"
          data-testid="input-customer-name"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-[var(--app-ink)]">Phone <span className="font-normal text-[var(--app-muted)]">optional</span></span>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+254…"
          className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-ink)]"
          data-testid="input-customer-phone"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-[var(--app-ink)]">Email <span className="font-normal text-[var(--app-muted)]">optional</span></span>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="where they would like their bill"
          className="min-h-11 rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-ink)]"
          data-testid="input-customer-email"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold text-[var(--app-ink)]">Notes <span className="font-normal text-[var(--app-muted)]">optional</span></span>
        <textarea
          rows={3}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Anything worth remembering — a usual table, a preference."
          className="rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] px-3 py-2.5 text-sm text-[var(--app-ink)]"
          data-testid="input-customer-notes"
        />
      </label>
      {create.isError && (
        <p role="alert" className="rounded-xl border border-[var(--app-critical)] bg-[var(--app-critical-soft)] px-3 py-2.5 text-sm text-[var(--app-critical)]">
          {(create.error as { data?: { error?: string } })?.data?.error ?? 'Could not add that customer.'}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!form.name.trim() || create.isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--app-gold)] px-4 text-sm font-semibold text-[var(--app-ink)] hover:opacity-90 disabled:opacity-50"
          data-testid="button-save-customer"
        >
          {create.isPending ? 'Saving…' : 'Add customer'}
        </button>
        <Link href="/customers" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-[var(--app-muted)] hover:bg-[var(--app-raised)]">
          Cancel
        </Link>
      </div>
      <p className="text-xs text-[var(--app-faint)]">
        A guest's visit count and spend are built from what they order, not entered
        here. This is only the name and how to reach them.
      </p>
    </form>
  </div>;
}

function Customers() {
  const customers = useGetCustomers();
  return <div className="rise">
    <PageIntro eyebrow="People / customers" title="Your customers" detail="VIP members, visit history, and notes." action={<Link href="/customers/new" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--app-gold)] px-4 text-sm font-semibold text-[var(--app-ink)] hover:bg-[var(--app-gold)]" data-testid="link-new-customer"><Plus size={16} /> Add customer</Link>} />
    <section className="surface rounded-2xl p-5">
      <QueryNotice loading={customers.isLoading} error={customers.error} what="customers" emptyTitle="No customers yet." emptyHint="Customers are created from reservations and the POS." empty={!customers.isLoading && !customers.isError && !customers.data?.length} onRetry={() => customers.refetch()} />
      {customers.data?.map((c: Customer) => <div key={c.id} className="flex items-center justify-between border-b border-[var(--app-line-soft)] py-3 last:border-0" data-testid={`row-customer-${c.id}`}>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--app-warn-soft)] text-[var(--app-ink)]">{c.name.slice(0,1)}</div>
          <div>
            <p className="font-semibold">{c.name}</p>
            <p className="text-xs text-[var(--app-muted)]">{c.phone ?? c.email ?? 'No contact'}</p>
          </div>
        </div>
        <span className={`text-xs font-semibold ${c.vipLevel !== 'NONE' ? 'text-[var(--app-warn)]' : 'text-[var(--app-muted)]'}`}>{c.vipLevel}</span>
      </div>)}
    </section>
  </div>;
}

function Events() {
  const events = useGetEvents();
  return <div className="rise">
    <PageIntro eyebrow="Events / bookings" title="Upcoming events" detail="Special nights, reservations, and VIP packages." action={<Button onClick={() => events.refetch()} data-testid="button-refresh-events"><RefreshCw size={15} /> Refresh</Button>} />
    <section className="surface rounded-2xl p-5">
      <QueryNotice loading={events.isLoading} error={events.error} what="events" emptyTitle="No events scheduled." emptyHint="Create an event to start tracking bookings." empty={!events.isLoading && !events.isError && !events.data?.length} onRetry={() => events.refetch()} />
      {events.data?.map((e: Event) => <div key={e.id} className="border-b border-[var(--app-line-soft)] py-4 last:border-0" data-testid={`card-event-${e.id}`}>
        <h3 className="font-display text-xl font-bold">{e.name}</h3>
        <p className="text-xs text-[var(--app-muted)] mt-1">{e.date} · {e.startTime}–{e.endTime} · capacity: {e.capacity}</p>
        {e.description && <p className="text-sm text-[var(--app-ink-soft)] mt-2">{e.description}</p>}
        <span className={`mt-2 inline-block w-fit text-xs font-semibold ${e.status === 'UPCOMING' ? 'text-[var(--app-success)]' : 'text-[var(--app-warn)]'}`}>{e.status}</span>
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
        <QueryNotice loading={sales.isLoading} error={sales.error} what="sales" empty={!sales.isLoading && !sales.isError && sales.data?.totalOrders === 0} emptyTitle="No completed sales in this window." emptyHint="Sales appear once an order is completed." onRetry={() => sales.refetch()} />
        {sales.data && <div className="space-y-3">
          <div className="flex items-center justify-between"><span className="text-sm text-[var(--app-muted)]">Total revenue</span><span className="font-mono font-bold">{money(sales.data.totalRevenue)}</span></div>
          <div className="flex items-center justify-between"><span className="text-sm text-[var(--app-muted)]">Total orders</span><span className="font-mono font-bold">{sales.data.totalOrders}</span></div>
          <div className="flex items-center justify-between"><span className="text-sm text-[var(--app-muted)]">Average order value</span><span className="font-mono font-bold">{sales.data.averageOrderValue ? money(sales.data.averageOrderValue) : '—'}</span></div>
        </div>}
      </section>
      <section className="surface rounded-2xl p-5">
        <h3 className="font-display text-xl font-bold mb-4">Recent activity</h3>
        <QueryNotice loading={audit.isLoading} error={audit.error} what="audit entries" emptyTitle="No audit entries yet." emptyHint="Actions on orders, stock and prices are recorded here." empty={!audit.isLoading && !audit.isError && !audit.data?.length} onRetry={() => audit.refetch()} />
        <div className="space-y-3">
          {audit.data?.slice(0, 10).map((log) => <div key={log.id} className="text-xs" data-testid={`row-audit-${log.id}`}>
            <span className="font-mono text-[var(--app-gold)]">{log.action}</span> · <span className="text-[var(--app-ink-soft)]">{log.entity} {log.entityId}</span>
            <span className="block text-[var(--app-muted)]">{new Date(log.createdAt).toLocaleString()}</span>
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
  const { user } = useUser();
  const me = useGetMe();

  const isOperator = me.data?.operator === true;
  // The branch switcher and the open-order badge are club furniture. A platform
  // operator usually runs no club at all, and asking the club API for their data
  // there would answer 403 on every page load — noise that hides a real failure.
  // So the queries wait until there is a club to ask about.
  const hasClub = Boolean(me.data?.organizationId);
  const branches = useGetBranches({ query: { queryKey: ['getBranches'], enabled: hasClub } });
  const openOrders = useGetOrders(undefined, {
    query: { queryKey: ['getOrders'], enabled: hasClub },
  });
  const openOrderCount = (openOrders.data ?? []).filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;
  const isOwner = me.data?.isOwner ?? false;
  const granted = me.data?.permissions;
  const visibleNav = useMemo(
    () =>
      nav.filter((item) => {
        if ('operatorOnly' in item && item.operatorOnly) {
          return me.data?.operator === true;
        }
        if (!('permission' in item) || !item.permission) return true;
        if (isOwner) return true;
        // While /me is still loading, show nothing rather than everything; the
        // server refuses these routes anyway, so an empty list is the honest
        // answer.
        if (!granted) return false;
        return granted.includes(item.permission);
      }),
    [granted, isOwner, me.data?.operator],
  );
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    user?.username ||
    'Signed in';

  const roleLabel = me.data?.role ?? (isOperator ? 'Operator' : me.data?.staff ? 'Staff' : 'No role assigned');

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?';

  const pulseSummary = useGetDashboardSummary({ query: { queryKey: ['getDashboardSummary'], enabled: hasClub } });
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
  return <div className="app-noise min-h-[100dvh] bg-[var(--app-bg)] md:flex">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col bg-[var(--app-chrome)] px-4 py-5 text-[var(--app-chrome-ink)] transition-transform md:static md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-9 flex items-center justify-between px-2"><Logo dark /><button onClick={() => setMobileOpen(false)} className="md:hidden" data-testid="button-close-menu"><X size={18} /></button></div>
      {/* No club, no branch to switch between. The switcher would read "No branch
          assigned" on every page, which looks like a fault rather than the fact
          that this account runs the platform rather than a venue. */}
      {hasClub && <div className="relative mb-6">
        <button onClick={() => setBranchOpen(!branchOpen)} className="flex w-full items-center justify-between rounded-xl bg-[var(--app-chrome-raised)] px-3 py-2.5 text-left" data-testid="button-branch-switcher"><span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--app-muted)]">Live branch</span><span className="mt-0.5 block truncate text-sm font-semibold">{branches.data?.[0]?.name ?? 'No branch assigned'}</span></span><ChevronDown size={15} className={branchOpen ? 'rotate-180 transition-transform' : 'transition-transform'} /></button>
        {branchOpen && <div className="absolute left-0 right-0 top-14 z-20 max-h-64 overflow-y-auto rounded-xl border border-[var(--app-line)] bg-[var(--app-chrome-raised)] p-1.5 shadow-xl">
          {!branches.data?.length && <p className="px-3 py-2 text-xs text-[var(--app-ink-soft)]">No branches yet.</p>}
          {branches.data?.map((branch) => <div key={branch.id} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm" data-testid={`button-branch-${branch.id}`}><span className="truncate">{branch.name}{branch.city ? <span className="ml-1 text-xs text-[var(--app-faint)]">{branch.city}</span> : null}</span><span className={branch.status === 'LIVE' ? 'text-xs text-[var(--app-success)]' : 'text-xs text-[var(--app-faint)]'}>{branch.status}</span></div>)}
        </div>}
      </div>}
      {/* Grouped by the job rather than the module, because a cashier's shift is
          "sell, take money, close" and a flat list of sixteen screens in whatever
          order they were written in does not say that. A section with nothing in
          it is dropped rather than left as a heading over nothing. */}
      {/* The console has eleven screens and one entry point, so an operator had to
          know a URL to reach anything past the overview. Its own navigation, shown
          only while inside /admin, so the club sidebar stays a club sidebar. */}
      {location.startsWith('/admin') && (
        <nav className="mb-6 grid gap-1 rounded-xl border border-[var(--app-line)] p-1.5" aria-label="Console">
          <p className="px-2 pb-1 pt-0.5 font-mono text-[9px] font-semibold uppercase tracking-[.18em] text-[var(--app-faint)]">
            Console
          </p>
          {([
            ['/admin', 'Overview', LayoutDashboard],
            ['/admin/clubs', 'Clubs', Store],
            ['/admin/new', 'New club', Building2],
            ['/admin/subscriptions', 'Subscriptions', Repeat],
            ['/admin/billing', 'Billing', CreditCard],
            ['/admin/plans', 'Plans', Layers],
            ['/admin/people', 'Administrators', UserRound],
            ['/admin/support', 'Support', LifeBuoy],
            ['/admin/system', 'System', Activity],
            ['/admin/audit', 'Audit', Database],
          ] as const).map(([href, label, Icon]) => {
            // A club detail page is a different screen reached from a club, so it
            // highlights the Clubs entry rather than having none.
            const active = location === href || (href === '/admin/clubs' && location.startsWith('/admin/clients'));
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${active ? 'bg-[var(--app-gold)] font-semibold text-[var(--app-ink)]' : 'text-[var(--app-muted)] hover:bg-[var(--app-chrome-raised)] hover:text-[var(--app-chrome-ink)]'}`}
                data-testid={`link-console-${label.toLowerCase().replaceAll(' ', '-')}`}
              >
                <Icon size={15} strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <nav className="grid gap-4" aria-label="Main navigation">
        {(['Tonight', 'Selling', 'Running the club', 'Numbers', 'Platform'] as const).map((group) => {
          const items = visibleNav.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="grid gap-1">
              <p className="px-3 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[.18em] text-[var(--app-faint)]">{group}</p>
              {items.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${location === href ? 'bg-[var(--app-gold)] font-semibold text-[var(--app-ink)]' : 'text-[var(--app-muted)] hover:bg-[var(--app-chrome-raised)] hover:text-[var(--app-chrome-ink)]'}`}
                  data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{label}</span>
                  {label === 'Orders' && openOrderCount > 0 && (
                    <span className="ml-auto rounded-full bg-[var(--app-critical)] px-1.5 py-0.5 text-[10px] text-[var(--app-gold-ink)]">{openOrderCount}</span>
                  )}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
       <div className="mt-auto grid gap-1 border-t border-[var(--app-line)] pt-4"><button onClick={signOutAndReturn} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-[var(--app-muted)] hover:bg-[var(--app-chrome-raised)] hover:text-[var(--app-chrome-ink)]" data-testid="button-sign-out"><DoorOpen size={17} /> Sign out</button></div>
      <div className="mt-5 rounded-xl border border-[var(--app-info)] bg-[var(--app-info)] p-3"><div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[.16em] text-[var(--app-success)]"><span>Table occupancy</span><span className="text-[var(--app-success)]">Live</span></div><div className="mb-2 flex items-end justify-between"><span className="font-display text-2xl font-bold">{pulseSummary.data ? `${shiftPulse.summary.occupancy}%` : '—'}</span><Activity size={17} className="text-[var(--app-gold)]" /></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-info)]"><div className="h-full rounded-full bg-[var(--app-gold)]" style={{ width: `${shiftPulse.summary.occupancy}%` }} /></div><p className="mt-2 text-[11px] text-[var(--app-success)]">{shiftPulse.summary.label}</p></div>
    </aside>
    {mobileOpen && <button onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[var(--app-info)]/45 md:hidden" aria-label="Close menu" data-testid="button-overlay-close" />}
    <main className="min-w-0 flex-1"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[var(--app-warn-soft)] bg-[var(--app-bg)]/95 px-4 backdrop-blur md:px-8"><div className="flex items-center gap-3"><Button variant="ghost" className="px-2 md:hidden" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu size={20} /></Button><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--app-muted)]">{todayLabel}</p><h1 className="font-display text-xl font-bold tracking-tight text-[var(--app-ink)]">{location === '/overview' ? 'Tonight at a glance' : nav.find((x) => x.href === location)?.label ?? (location === '/settings' ? 'Workspace settings' : 'Dunda')}</h1></div></div><div className="flex items-center gap-2"><GlobalSearch onNavigate={(href) => setLocation(href)} /><NotificationBell /><div className="hidden h-7 w-px bg-[var(--app-line)] sm:block" /><button onClick={() => void openUserProfile()} className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-[var(--app-line)]" data-testid="button-user-menu"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--app-success-soft)] text-xs font-bold text-[var(--app-success)]">{initials}</span><span className="hidden text-left sm:block"><span className="block max-w-[16ch] truncate text-xs font-semibold">{displayName}</span><span className="block max-w-[16ch] truncate text-[10px] text-[var(--app-muted)]">{roleLabel}</span></span></button></div></header><SubscriptionPaymentNotice enabled={hasClub && !isOperator} canRequest={isOwner} /><div className="mx-auto max-w-[1500px] p-4 md:p-8">{children}<footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-line-soft)] pt-4 text-[11px] text-[var(--app-faint)]" data-testid="app-footer"><span>© {new Date().getFullYear()} Dunda</span><a href={VENDOR_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-[var(--app-line)] underline-offset-4 transition-colors hover:text-[var(--app-gold)]">Built and maintained by {VENDOR_NAME}</a></footer></div></main>
  </div>;
}

/**
 * The club's subscription payment, at the top of every
 * screen until it is paid.
 *
 * The link opens Pesapal on the owner's own device,
 * which is the only place the payment can be made: it
 * is their card and their mandate, not the club's till.
 * A club whose last link expired — the provider lets
 * them lapse — is offered a fresh one instead.
 */
function SubscriptionPaymentNotice({
  enabled,
  canRequest,
}: {
  enabled: boolean;
  canRequest: boolean;
}) {
  const { data } = useSubscriptionPayment(enabled);
  const request = useRequestSubscriptionPayment();
  const payment = data?.payment ?? null;
  const subscription = data?.subscription ?? null;
  const owesWithoutLink =
    payment === null &&
    subscription !== null &&
    subscription.amount > 0 &&
    ['TRIAL', 'PAST_DUE', 'PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(
      subscription.status,
    );

  if (payment === null && !owesWithoutLink) return null;

  const amount = payment?.amount ?? subscription?.amount ?? 0;

  return (
    <div
      className="border-b border-[var(--app-gold)] bg-[var(--app-gold)] px-4 py-2.5 md:px-8"
      data-testid="subscription-payment-due"
    >
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--app-ink)]">
          <CreditCard size={15} />
          Subscription payment due — {money(amount)}
          {subscription?.autoRenew && (
            <span className="text-xs font-medium opacity-70">
              · renews automatically
            </span>
          )}
        </p>
        {payment !== null ? (
          <a
            href={payment.redirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--app-ink)] px-3 text-xs font-bold text-[var(--app-bg)] hover:opacity-90"
            data-testid="link-pay-subscription"
          >
            Pay now <ChevronRight size={13} />
          </a>
        ) : canRequest ? (
          <button
            onClick={() => request.mutate()}
            disabled={request.isPending}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--app-ink)] px-3 text-xs font-bold text-[var(--app-bg)] hover:opacity-90 disabled:opacity-50"
            data-testid="button-request-payment-link"
          >
            {request.isPending ? 'Getting link…' : 'Get payment link'}
          </button>
        ) : (
          <span className="text-xs font-medium text-[var(--app-ink)] opacity-70">
            The club owner can pay from their account.
          </span>
        )}
      </div>
    </div>
  );
}

function PageIntro({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[.2em] text-[var(--app-faint)]">{eyebrow}</p><h2 className="font-display text-3xl font-extrabold tracking-[-.04em] text-[var(--app-ink)] md:text-4xl">{title}</h2><p className="mt-2 max-w-2xl text-sm text-[var(--app-faint)]">{detail}</p></div>{action}</div>;
}

function Metric({ label, value, note, trend, tone = 'plain' }: { label: string; value: string; note: string; trend?: 'up' | 'down'; tone?: 'plain' | 'coral' | 'green' }) {
  return <div className={`surface rounded-2xl p-4 md:p-5 ${tone === 'coral' ? 'bg-[var(--app-gold)] text-[var(--app-ink)]' : tone === 'green' ? 'bg-[var(--app-success-soft)]' : ''}`}><div className="mb-4 flex items-start justify-between"><span className={`text-xs font-semibold uppercase tracking-[.12em] ${tone === 'plain' ? 'text-[var(--app-faint)]' : 'opacity-70'}`}>{label}</span>{trend && <span className={`flex items-center gap-1 text-xs font-semibold ${trend === 'up' ? 'text-[var(--app-success)]' : 'text-[var(--app-critical)]'}`}>{trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{trend === 'up' ? 'on plan' : 'watch'}</span>}</div><div className="font-display text-3xl font-bold tracking-tight">{value}</div><p className={`mt-1 text-xs ${tone === 'plain' ? 'text-[var(--app-muted)]' : 'opacity-70'}`}>{note}</p></div>;
}

/**
 * The dashboard a platform operator sees.
 *
 * There is no club to run, so this is not an empty shell pretending to be a
 * shift. It answers the two questions somebody running Dunda actually has — how
 * many clubs are on it, and how much they pay — and puts the console one click
 * away, which is the whole reason this account can see anything at all.
 */
function PlatformLanding() {
  const summary = useGetAdminSummary();
  const organizations = useGetAdminOrganizations();
  const o = summary.data;
  const loading = summary.isLoading && !summary.data;

  const cards = [
    { label: 'Clubs on Dunda', value: o ? String(o.clubs).padStart(2, '0') : '—', note: o ? `${o.activeClubs} live · ${o.trialClubs} on trial` : 'Loading' },
    { label: 'Monthly recurring', value: o ? money(o.mrr) : '—', note: o ? `${money(o.collected)} collected` : 'Loading' },
    { label: 'Active staff', value: o ? String(o.activeStaff).padStart(2, '0') : '—', note: o ? `Across ${o.liveBranches} live branches` : 'Loading' },
    { label: 'Needs attention', value: o ? String(o.pastDueClubs + o.suspendedClubs).padStart(2, '0') : '—', note: o ? `${o.pastDueClubs} past due · ${o.suspendedClubs} suspended` : 'Loading' },
  ];

  return <div className="rise">
    <PageIntro eyebrow={`Platform / ${todayLabel}`} title="Run the platform."
      detail="You are signed in as a Dunda administrator, so this account runs the clubs rather than serving one. Everything below is read across every organisation."
      action={<Link href="/admin" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--app-gold)] px-4 text-sm font-semibold text-[var(--app-ink)] hover:bg-[var(--app-gold)]" data-testid="link-open-admin"><Store size={16} /> Open admin <ChevronRight size={15} /></Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, i) => <Metric key={card.label} label={card.label} value={card.value} note={card.note} tone={i === 1 ? 'coral' : 'plain'} />)}
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <section className="surface rounded-2xl p-5 md:p-6">
        <div className="mb-5 flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-faint)]">Clubs</p><h3 className="mt-1 font-display text-xl font-bold">Every organisation</h3></div><Link href="/admin/clubs" className="text-xs font-semibold text-[var(--app-success)]" data-testid="link-view-clubs">Manage <ChevronRight className="inline" size={13} /></Link></div>
        <QueryNotice loading={organizations.isLoading} error={organizations.error} what="clubs" emptyTitle="No clubs yet." emptyHint="Provision one and it appears here." empty={!organizations.isLoading && !organizations.isError && !organizations.data?.length} onRetry={() => organizations.refetch()} />
        {(organizations.data ?? []).slice(0, 6).map((club) => <div key={club.id} className="flex items-center gap-3 border-b border-[var(--app-line-soft)] py-3 last:border-0" data-testid={`club-${club.id}`}>
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--app-success-soft)] text-[var(--app-success)]"><Store size={14} /></div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{club.name}</p><p className="truncate text-xs text-[var(--app-muted)]">{club.branches} {club.branches === 1 ? 'branch' : 'branches'} · {club.activeStaff} {club.activeStaff === 1 ? 'person' : 'people'}</p></div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${club.subscriptionStatus === 'ACTIVE' ? 'bg-[var(--app-success-soft)] text-[var(--app-success)]' : club.subscriptionStatus === 'SUSPENDED' ? 'bg-[var(--app-critical-soft)] text-[var(--app-critical)]' : 'bg-[var(--app-warn-soft)] text-[var(--app-warn)]'}`}>{club.plan ?? club.subscriptionStatus ?? 'No plan'}</span>
        </div>)}
      </section>
      <section className="surface rounded-2xl p-5 md:p-6">
        <div className="mb-5"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-faint)]">Subscriptions</p><h3 className="mt-1 font-display text-xl font-bold">Where they stand</h3></div>
        {loading ? <p className="text-sm text-[var(--app-muted)]">Reading the platform…</p> : o ? <div className="grid gap-2.5">
          {([
            ['Active', o.activeClubs, 'var(--app-success)'],
            ['On trial', o.trialClubs, 'var(--app-warn)'],
            ['Past due', o.pastDueClubs, 'var(--app-warn)'],
            ['Cancelled', o.cancelledClubs, 'var(--app-critical)'],
          ] as const).map(([label, value, color]) => <div key={label} className="flex items-center justify-between rounded-xl bg-[var(--app-bg)] px-3 py-2.5"><span className="flex items-center gap-2.5 text-sm font-semibold"><i className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}</span><span className="font-mono text-sm font-medium">{value}</span></div>)}
          <Link href="/admin/billing" className="mt-2 flex items-center justify-between rounded-xl border border-[var(--app-line)] px-3 py-2.5 text-sm font-semibold text-[var(--app-success)]" data-testid="link-view-billing">Billing and invoices <ChevronRight size={14} /></Link>
        </div> : null}
      </section>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[
        { href: '/admin/clubs', label: 'Clubs', detail: 'Provision, suspend, transfer ownership', icon: Store },
        { href: '/admin/plans', label: 'Plans', detail: 'Pricing, limits and modules', icon: LayoutDashboard },
        { href: '/admin/people', label: 'Administrators', detail: 'Who else can run the platform', icon: UserRound },
        { href: '/admin/billing', label: 'Billing', detail: 'Payments, invoices and revenue', icon: CreditCard },
        { href: '/admin/audit', label: 'Audit', detail: 'Every action taken on a club', icon: Database },
      ].map(({ href, label, detail, icon: Icon }) => <Link key={href} href={href} className="surface flex items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-[var(--app-warn-soft)]" data-testid={`link-console-${label.toLowerCase()}`}>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--app-chrome-raised)] text-[var(--app-chrome-ink)]"><Icon size={17} /></div>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{label}</p><p className="truncate text-xs text-[var(--app-muted)]">{detail}</p></div><ChevronRight size={15} className="shrink-0 text-[var(--app-faint)]" />
      </Link>)}
    </div>
  </div>;
}

function Overview() {
  const me = useGetMe();
  // These four screens describe one club's night. An operator running no club has
  // no night to describe, and asking anyway answers 403 four times — noise that
  // buries a real failure. So they wait, and the platform view takes over below.
  const hasClub = Boolean(me.data?.organizationId);
  const summary = useGetDashboardSummary({ query: { queryKey: ['getDashboardSummary'], enabled: hasClub } });
  const activity = useGetDashboardActivity({ query: { queryKey: ['getDashboardActivity'], enabled: hasClub } });
  const alerts = useGetInventoryAlerts({ query: { queryKey: ['getInventoryAlerts'], enabled: hasClub } });
  const reservations = useGetReservations({ query: { queryKey: ['getReservations'], enabled: hasClub } });
  const s = summary.data;
  const series = s?.revenueSeries ?? [];
  const max = Math.max(...series.map((x) => x.value), 1);
  const occupancyPct = s && s.totalTables > 0 ? Math.round((s.activeTables / s.totalTables) * 100) : 0;
  // A platform operator has no club, so there is no room to watch. Offering the
  // console here — rather than an empty dashboard they cannot act on — is what
  // makes the admin entry in the nav worth having.
  if (me.data?.operator === true && !hasClub) return <PlatformLanding />;
  return <div className="rise"><PageIntro eyebrow={`Command center / ${todayLabel}`} title="Run the room." detail={s?.branchName ? `${s.branchName} · live now` : 'Live shift'} action={<Link href="/pos" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--app-gold)] px-4 text-sm font-semibold text-[var(--app-ink)] hover:bg-[var(--app-gold)]" data-testid="link-open-pos"><ShoppingBag size={16} /> Open POS <ChevronRight size={15} /></Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Revenue tonight" value={s ? money(s.revenue) : '—'} note={`${s?.orders ?? 0} completed orders`} tone="coral" /><Metric label="Open tabs" value={s ? String(s.activeTabs).padStart(2, '0') : '—'} note={s ? `${s.activeTables} tables currently active` : 'Loading live count'} /><Metric label="Average order" value={s ? money(s.averageOrderValue) : '—'} note="Across all payment methods" /><Metric label="Outstanding" value={s ? money(s.outstandingPayments) : '—'} note={s && s.outstandingPayments > 0 ? 'Needs attention before close' : 'Nothing outstanding'} /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]"><section className="surface rounded-2xl p-5 md:p-6"><div className="mb-6 flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-faint)]">Revenue flow</p><h3 className="mt-1 font-display text-xl font-bold">This shift, by hour</h3></div><button className="flex items-center gap-1 rounded-lg border border-[var(--app-line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--app-faint)]" data-testid="button-revenue-filter">Today <ChevronDown size={13} /></button></div><QueryNotice loading={summary.isLoading} error={summary.error} what="today's summary" onRetry={() => summary.refetch()} />{!summary.isLoading && !summary.isError && <><div className="flex h-[205px] items-end gap-1.5 border-b border-[var(--app-warn-soft)] pb-0 pt-3 sm:gap-3">{series.length === 0 && <p className="py-16 text-center text-sm text-[var(--app-muted)]">No completed orders yet today.</p>}
        {series.length > 0 && series.map((point, i) => <div key={`${point.label}-${i}`} className="group flex h-full flex-1 flex-col justify-end gap-2"><div className="relative flex flex-1 items-end"><div className={`w-full rounded-t-md transition-all duration-300 ${i === series.length - 1 ? 'bg-[var(--app-gold)]' : 'bg-[var(--app-success)] group-hover:bg-[var(--app-success)]'}`} style={{ height: `${Math.max(5, (point.value / max) * 100)}%` }}><span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--app-chrome-raised)] px-1.5 py-1 font-mono text-[9px] text-[var(--app-chrome-ink)] group-hover:block">{money(point.value)}</span></div></div><span className="text-center font-mono text-[9px] text-[var(--app-muted)]">{point.label}</span></div>)}</div><div className="mt-4 flex flex-wrap gap-5 text-xs text-[var(--app-muted)]"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--app-gold)]" /> Current hour</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--app-success)]" /> Completed hours</span></div></>}</section>
      <section className="surface rounded-2xl p-5 md:p-6"><div className="mb-5 flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-faint)]">Room watch</p><h3 className="mt-1 font-display text-xl font-bold">Right now</h3></div><Link href="/floor" className="text-xs font-semibold text-[var(--app-success)]" data-testid="link-view-floor">View floor <ChevronRight className="inline" size={13} /></Link></div><div className="grid gap-3">{[{ label: 'Drinks', value: s ? money(s.drinkRevenue) : '—', color: 'var(--app-gold)' }, { label: 'Food', value: s ? money(s.foodRevenue) : '—', color: 'var(--app-success)' }, { label: 'Other', value: s ? money(s.otherRevenue) : '—', color: 'var(--app-warn)' }].map((row) => <div key={row.label} className="flex items-center gap-3 rounded-xl bg-[var(--app-bg)] p-3"><span className="h-9 w-1 rounded-full" style={{ background: row.color }} /><div className="flex-1"><span className="block text-sm font-semibold">{row.label}</span><span className="text-xs text-[var(--app-muted)]">Revenue mix</span></div><span className="font-mono text-sm font-medium">{row.value}</span></div>)}</div><div className="mt-6 border-t border-[var(--app-line-soft)] pt-4"><div className="flex items-center justify-between text-xs text-[var(--app-faint)]"><span>Active tables</span><span className="font-mono font-medium text-[var(--app-ink)]">{s?.activeTables ?? '—'} / {s?.totalTables ?? '—'}</span></div><div className="mt-2 h-2 rounded-full bg-[var(--app-line-soft)]"><div className="h-full rounded-full bg-[var(--app-success)]" style={{ width: `${occupancyPct}%` }} /></div></div></section></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1fr_1fr]"><section className="surface rounded-2xl p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-bold">Live activity</h3><Link href="/orders" className="text-xs font-semibold text-[var(--app-success)]" data-testid="link-view-activity">See queue</Link></div><QueryNotice loading={activity.isLoading} error={activity.error} what="activity" emptyTitle="Nothing has happened yet." emptyHint="Payments and orders show up here as they occur." empty={!activity.isLoading && !activity.isError && !activity.data?.length} onRetry={() => activity.refetch()} />{activity.data?.slice(0, 4).map((item) => <div key={item.id} className="flex gap-3 border-b border-[var(--app-line-soft)] py-3 last:border-0" data-testid={`activity-${item.id}`}><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--app-success-soft)] text-[var(--app-success)]"><Activity size={14} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="truncate text-xs text-[var(--app-muted)]">{item.detail}</p></div><span className="shrink-0 font-mono text-[10px] text-[var(--app-faint)]">{timeAgo(item.timestamp)}</span></div>)}</section><section className="surface rounded-2xl p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-bold">Low stock</h3><Link href="/inventory" className="text-xs font-semibold text-[var(--app-success)]" data-testid="link-view-inventory">View all</Link></div><QueryNotice loading={alerts.isLoading} error={alerts.error} what="stock alerts" emptyTitle="Stock is healthy." emptyHint="No product is below its reorder level." empty={!alerts.isLoading && !alerts.isError && !alerts.data?.length} onRetry={() => alerts.refetch()} />{alerts.data?.slice(0, 4).map((alert) => <div key={alert.id} className="flex items-center gap-3 border-b border-[var(--app-line-soft)] py-3 last:border-0"><div className={`grid h-8 w-8 place-items-center rounded-lg ${alert.severity === 'OUT' ? 'bg-[var(--app-critical-soft)] text-[var(--app-critical)]' : 'bg-[var(--app-warn-soft)] text-[var(--app-warn)]'}`}><Package size={14} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{alert.name}</p><p className="text-xs text-[var(--app-muted)]">{alert.category}</p></div><span className={`font-mono text-xs font-medium ${alert.severity === 'OUT' ? 'text-[var(--app-critical)]' : 'text-[var(--app-warn)]'}`}>{alert.stock} {alert.unit}</span></div>)}</section><section className="surface rounded-2xl p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-bold">Next reservations</h3><Link href="/reservations" className="text-xs font-semibold text-[var(--app-success)]" data-testid="link-view-reservations">Manage</Link></div><QueryNotice loading={reservations.isLoading} error={reservations.error} what="reservations" emptyTitle="No reservations yet." emptyHint="Bookings appear here as guests arrive." empty={!reservations.isLoading && !reservations.isError && !reservations.data?.length} onRetry={() => reservations.refetch()} />{reservations.data?.slice(0, 4).map((res) => <div key={res.id} className="flex items-center gap-3 border-b border-[var(--app-line-soft)] py-3 last:border-0"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--app-info-soft)] font-mono text-[10px] font-medium text-[var(--app-success)]">{res.time}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{res.customer}</p><p className="text-xs text-[var(--app-muted)]">{res.guests} guests · {res.table}</p></div><span className="rounded-full bg-[var(--app-success-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--app-success)]">{res.status}</span></div>)}</section></div>
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
  // A payment the provider is taking. The till cannot
  // close the tab itself — the provider's answer does.
  const [pendingPayment, setPendingPayment] = useState<{ attemptId: string; redirectUrl: string; amount: number } | null>(null);
  const qc = useQueryClient();
  const createTab = useCreateTab();
  const addItem = useAddTabItem();
  const checkout = useCheckoutTab();
  const attempt = usePaymentAttempt(pendingPayment?.attemptId ?? null);
  const detail = allTabs.data?.find((t) => t.id === selectedId);
  const list = products.data ?? [];
  const cats = ['All', ...Array.from(new Set(list.map((p) => p.category)))];
  const filtered = list.filter((p) => (category === 'All' || p.category === category) && p.name.toLowerCase().includes(search.toLowerCase()));
  const openTab = detail ?? tabs.data?.find((tab) => tab.id === selectedId);
  const create = (event: FormEvent) => { event.preventDefault(); if (!customer || !table) return; createTab.mutate({ data: { customer, table } }, { onSuccess: (tab) => { setSelectedId(tab.id); setShowNew(false); setCustomer(''); setTable(''); qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: 'OPEN' }) }); } }); };
  const add = (p: Product) => { if (!selectedId) { setNotice('Open a tab first, then add items.'); return; } addItem.mutate({ tabId: selectedId, data: { productId: p.id, quantity: 1 } }, { onSuccess: (tab) => {       qc.setQueryData(getGetTabsQueryKey({ status: 'OPEN' }), tabs.data); qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: 'OPEN' }) }); setNotice(`${p.name} added`); } }); };
  const pay = () => { if (!openTab) return; checkout.mutate({ tabId: openTab.id, data: { payments: [{ method: payment, amount: openTab.total }], idempotencyKey: crypto.randomUUID() } }, { onSuccess: (result) => { if ('status' in result) { setPendingPayment({ attemptId: result.attemptId, redirectUrl: result.redirectUrl, amount: result.amount }); return; } setNotice(`Receipt ${result.receipt.number} closed successfully`); setSelectedId(undefined); qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: 'OPEN' }) }); qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } }); };
  // The poll answers what the callback may have missed:
  // a resolved attempt settles the tab, a failed one
  // leaves the bill open.
  useEffect(() => {
    if (!pendingPayment || !attempt.data) return;
    if (attempt.data.status === 'RESOLVED') {
      setNotice(`Payment of ${money(attempt.data.amount)} received · tab settled`);
      setPendingPayment(null);
      setSelectedId(undefined);
      qc.invalidateQueries({ queryKey: getGetTabsQueryKey({ status: 'OPEN' }) });
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    } else if (attempt.data.status === 'FAILED') {
      setNotice(attempt.data.failureReason ?? 'The payment did not go through.');
      setPendingPayment(null);
    }
  }, [attempt.data, pendingPayment, qc]);
  return <div className="rise"><PageIntro eyebrow="Fast lane / POS" title="Take the order." detail="Tap a product to send it to the selected tab. Built for a busy counter and a 10-inch tablet." action={<Button onClick={() => setShowNew(true)} data-testid="button-new-tab"><Plus size={16} /> New tab</Button>} />
    {notice && <div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--app-success-soft)] bg-[var(--app-success-soft)] px-4 py-3 text-sm text-[var(--app-success)]" data-testid="status-pos-success"><span>{notice}</span><button onClick={() => setNotice('')} data-testid="button-dismiss-notice"><X size={15} /></button></div>}
    <div className="grid gap-5 xl:grid-cols-[1fr_370px]"><section className="min-w-0"><div className="mb-4 flex gap-2 overflow-x-auto pb-1 mobile-scroll">{cats.map((cat) => <button key={cat} onClick={() => setCategory(cat)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${category === cat ? 'bg-[var(--app-chrome-raised)] text-[var(--app-chrome-ink)]' : 'bg-[var(--app-line)] text-[var(--app-faint)] hover:bg-[var(--app-warn-soft)]'}`} data-testid={`button-category-${cat.toLowerCase()}`}>{cat}</button>)}</div><label className="mb-5 flex h-11 items-center gap-2 rounded-xl border border-[var(--app-warn-soft)] bg-[var(--app-surface)] px-3 text-[var(--app-muted)]"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm text-[var(--app-ink)] outline-none placeholder:text-[var(--app-muted)]" placeholder="Search drinks, dishes, cover..." data-testid="input-search-products" /></label><QueryNotice loading={products.isLoading} error={products.error} what="products" empty={!products.isLoading && !products.isError && !filtered.length} onRetry={() => products.refetch()} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{filtered.map((p) => <button key={p.id} onClick={() => add(p)} disabled={!p.available || addItem.isPending} className="surface group min-h-[142px] rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-45" data-testid={`button-product-${p.id}`}><div className="mb-6 flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl text-sm font-bold" style={{ background: `${p.accent}25`, color: p.accent }}>{p.category.slice(0, 1)}</span><span className="font-mono text-xs text-[var(--app-faint)]">{p.unit}</span></div><span className="block text-sm font-semibold leading-tight">{p.name}</span><span className="mt-1 block font-mono text-sm font-medium text-[var(--app-gold)]">{money(p.price)}</span></button>)}</div></section><aside className="surface h-fit rounded-2xl p-4 md:sticky md:top-[88px]"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[var(--app-faint)]">Checkout rail</p><h3 className="font-display text-xl font-bold">Open tabs</h3></div><span className="rounded-full bg-[var(--app-gold-soft)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--app-critical)]">{tabs.data?.length ?? 0} live</span></div><div className="mb-4 grid gap-2">{tabs.isLoading ? <><Skeleton className="h-16" /><Skeleton className="h-16" /></> : tabs.isError ? <QueryNotice error onRetry={() => tabs.refetch()} /> : tabs.data?.length ? tabs.data.map((tab) => <button key={tab.id} onClick={() => setSelectedId(tab.id)} className={`rounded-xl border p-3 text-left ${selectedId === tab.id ? 'border-[var(--app-gold)] bg-[var(--app-gold-ink)]' : 'border-[var(--app-line-soft)] bg-[var(--app-warn-soft)] hover:border-[var(--app-warn-soft)]'}`} data-testid={`button-tab-${tab.id}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold">{tab.customer}</span><span className="font-mono text-[10px] text-[var(--app-faint)]">#{tab.number}</span></div><div className="mt-1 flex items-center justify-between text-xs text-[var(--app-muted)]"><span>{tab.table} · {tab.items.length} items</span><span className="font-mono font-medium text-[var(--app-ink)]">{money(tab.total)}</span></div></button>) : <QueryNotice empty />}</div>{openTab ? <div className="border-t border-[var(--app-line-soft)] pt-4"><div className="mb-3 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[var(--app-faint)]">Tab #{openTab.number}</p><h4 className="font-display text-lg font-bold">{openTab.customer}</h4></div><span className="rounded-full bg-[var(--app-success-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--app-success)]">{openTab.table}</span></div><div className="scroll-thin max-h-44 overflow-auto">{openTab.items.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-[var(--app-line-soft)] py-2 text-sm"><span><b className="mr-2 font-mono text-xs text-[var(--app-gold)]">{item.quantity}×</b>{item.name}</span><span className="font-mono text-xs">{money(item.total)}</span></div>)}</div><div className="mt-3 grid gap-1 text-xs text-[var(--app-muted)]"><div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{money(openTab.subtotal)}</span></div><div className="flex justify-between"><span>Service + tax</span><span className="font-mono">{money(openTab.serviceCharge + openTab.tax)}</span></div><div className="mt-2 flex justify-between border-t border-[var(--app-warn-soft)] pt-2 text-base font-bold text-[var(--app-ink)]"><span>Total</span><span className="font-mono">{money(openTab.total)}</span></div></div><div className="mt-4 grid grid-cols-3 gap-1.5">{(['CASH', 'MPESA', 'CARD'] as CheckoutInputMethod[]).map((method) => <button key={method} onClick={() => setPayment(method)} className={`rounded-lg py-2 text-[10px] font-semibold ${payment === method ? 'bg-[var(--app-chrome-raised)] text-[var(--app-warn-soft)]' : 'bg-[var(--app-line-soft)] text-[var(--app-muted)]'}`} data-testid={`button-payment-${method.toLowerCase()}`}>{method === 'MPESA' ? 'M-Pesa' : method[0] + method.slice(1).toLowerCase()}</button>)}</div><Button className="mt-3 w-full" onClick={pay} disabled={checkout.isPending} data-testid="button-checkout">{checkout.isPending ? 'Closing tab…' : `Charge ${money(openTab.total)}`}</Button></div> : <div className="rounded-xl bg-[var(--app-bg)] p-5 text-center text-sm text-[var(--app-muted)]"><CreditCard className="mx-auto mb-2 text-[var(--app-success)]" size={22} /><p>Select an open tab to see its check.</p></div>}</aside></div>
    {showNew && <Modal title="Open a new tab" onClose={() => setShowNew(false)}><form onSubmit={create} className="grid gap-4"><Field label="Customer name"><input required value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Nia" data-testid="input-tab-customer" /></Field><Field label="Table or seat"><input required value={table} onChange={(e) => setTable(e.target.value)} placeholder="e.g. T-14" data-testid="input-tab-table" /></Field><Button className="mt-2 w-full" disabled={createTab.isPending} data-testid="button-create-tab">{createTab.isPending ? 'Opening…' : 'Open tab'}</Button></form></Modal>}
    {pendingPayment && <Modal title="Waiting for payment" onClose={() => setPendingPayment(null)}><div className="grid gap-4"><p className="text-sm text-[var(--app-ink-soft)]">Send the guest this link to pay <strong>{money(pendingPayment.amount)}</strong>. The tab settles on its own when the payment goes through.</p><a href={pendingPayment.redirectUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center rounded-xl bg-[var(--app-gold)] px-4 text-sm font-semibold text-[var(--app-ink)]" data-testid="link-open-payment">Open payment page</a><p className="text-center font-mono text-[10px] uppercase tracking-wider text-[var(--app-faint)]">Checking every few seconds…</p></div></Modal>}
  </div>;
}

function Floor() {
  const branches = useGetBranches();
  const [branchId, setBranchId] = useState('');
  const id = branchId || branches.data?.[0]?.id || '';
  const floor = useGetBranchFloor(id, { query: { enabled: Boolean(id), queryKey: getGetBranchFloorQueryKey(id) } });
  const sections = floor.data?.sections ?? [];
  const tableCount = sections.reduce((sum, section) => sum + section.tables.length, 0);
  const colors: Record<string, string> = { AVAILABLE: 'border-[var(--app-success-soft)] bg-[var(--app-success-soft)] text-[var(--app-success)]', OCCUPIED: 'border-[var(--app-gold-soft)] bg-[var(--app-gold-ink)] text-[var(--app-critical)]', RESERVED: 'border-[var(--app-warn)] bg-[var(--app-warn-soft)] text-[var(--app-warn)]', PAYMENT_PENDING: 'border-[var(--app-critical-soft)] bg-[var(--app-critical-soft)] text-[var(--app-critical)]', CLEANING: 'border-[var(--app-line)] bg-[var(--app-ink)] text-[var(--app-faint)]' };
  return <div className="rise"><PageIntro eyebrow={`Live floor / ${tableCount} tables`} title="Know every seat." detail="A live read of the room. Tap a table to see its current check and handoff." action={<select value={id} onChange={(e) => setBranchId(e.target.value)} className="h-10 rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] px-3 text-sm font-semibold outline-none" data-testid="select-floor-branch">{branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>} /><div className="mb-5 flex flex-wrap gap-2">{Object.entries({ AVAILABLE: 'Available', OCCUPIED: 'Occupied', RESERVED: 'Reserved', PAYMENT_PENDING: 'Payment due', CLEANING: 'Resetting' }).map(([key, label]) => <span key={key} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${colors[key]}`}><i className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />{label}</span>)}</div><QueryNotice loading={floor.isLoading || branches.isLoading} error={floor.isError || branches.isError} empty={!floor.isLoading && !floor.isError && !sections.length} onRetry={() => floor.refetch()} /><div className="grid gap-5 lg:grid-cols-2">{sections.map((section) => <section key={section.id} className="surface rounded-2xl p-5"><div className="mb-4 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-faint)]">Section</p><h3 className="font-display text-xl font-bold">{section.name}</h3></div><span className="font-mono text-xs text-[var(--app-muted)]">{section.tables.length} seats</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{section.tables.map((t) => <button key={t.id} className={`min-h-[116px] rounded-xl border p-3 text-left transition-transform hover:-translate-y-0.5 ${colors[t.status]}`} data-testid={`button-table-${t.id}`}><div className="flex items-start justify-between"><span className="font-display text-xl font-bold">{t.name}</span><span className="font-mono text-[10px]">{t.seats} pax</span></div><span className="mt-5 block text-xs font-semibold">{t.status.replace('_', ' ')}</span><span className="mt-1 block font-mono text-sm font-medium">{t.total ? money(t.total) : '—'}</span></button>)}</div></section>)}</div></div>;
}

interface PoolTableView {
  id: string;
  name: string;
  status: string;
  rate: number;
  minimumMinutes: number;
  hasRate: boolean;
  session: {
    id: string;
    status: string;
    elapsedSeconds: number;
    rate: number;
    accrued: number;
  } | null;
}

/** A running game reads as hours and minutes rather than a raw seconds count. */
function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}


/**
 * Where a role lands when it signs in.
 *
 * Everyone opening on the same screen is why the app can feel generic: a
 * bartender and the owner both got the revenue command centre, and neither of
 * those was what they opened the app to do. Each role now starts on the screen
 * that is its work, and the list is ordered so the first entry they may use
 * wins — a permission the role does not hold is skipped rather than sent
 * somewhere they cannot follow.
 */
const ROLE_LANDING: { match: string[]; href: string }[] = [
  // Management first. A manager can do everything a pool attendant can, so
  // ordering by permission rather than by seniority would drop the owner of the
  // club onto the pool screen — which is why this list is built from what each
  // role is for, and the manager entries come ahead of the floor ones.
  { match: ['manage_staff', 'manage_roles'], href: '/overview' },
  { match: ['void_order', 'refund_payment'], href: '/overview' },
  { match: ['adjust_inventory', 'approve_transfer'], href: '/inventory' },
  { match: ['view_reports'], href: '/reports' },
  { match: ['manage_payments'], href: '/pos' },
  { match: ['update_ticket'], href: '/bar' },
  // Before reservations on purpose. A pool attendant takes bookings, but the
  // tables themselves are the job — landing them on a calendar to manage the
  // exception rather than the norm is the wrong first screen.
  { match: ['manage_pool'], href: '/pool' },
  { match: ['manage_reservations'], href: '/reservations' },
  { match: ['view_pos'], href: '/pos' },
];

function landingFor(permissions: string[] | undefined): string | null {
  if (!permissions) return null;
  for (const candidate of ROLE_LANDING) {
    if (candidate.match.some((permission) => permissions.includes(permission))) {
      return candidate.href;
    }
  }
  return null;
}

/**
 * The pool area.
 *
 * A pool attendant's whole job is these five tables, so it is its own screen
 * rather than something buried in the floor view. Rate and accrued time come from
 * the server on every read, so the number an attendant quotes is the number the
 * session will actually settle at — the charge is worked out from the rate rules
 * in the database, never from a value held in the browser.
 */
function Pool() {
  const [tables, setTables] = useState<PoolTableView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/pool/tables', { credentials: 'include' });
      if (!response.ok) throw new Error('Could not read the pool tables.');
      const body = (await response.json()) as { tables: PoolTableView[] };
      setTables(body.tables);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the pool tables.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // A running session's charge moves on its own, so the table is re-read on a
    // timer rather than only when the attendant presses something.
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  async function act(poolTableId: string, action: 'PAUSE' | 'RESUME' | 'END') {
    const session = tables.find((t) => t.session)?.session;
    if (!session) return;
    setBusy(`${poolTableId}:${action}`);
    try {
      const response = await fetch(`/api/pool/sessions/${session.id}?action=${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'That could not be done.');
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be done.');
    } finally {
      setBusy(null);
    }
  }

  async function start(poolTableId: string) {
    setBusy(`${poolTableId}:START`);
    try {
      const response = await fetch('/api/pool/tables', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ poolTableId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'That table could not be opened.');
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That table could not be opened.');
    } finally {
      setBusy(null);
    }
  }

  return <div className="rise">
    <PageIntro eyebrow="Tonight / Pool" title="Pool tables."
      detail="Start a game, pause it while the table turns over, end it when they leave. The charge follows the rate the club has configured."
      action={<button onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--app-line)] px-4 text-sm font-semibold text-[var(--app-ink-soft)] hover:bg-[var(--app-raised)]">Refresh</button>} />
    {error && <p role="alert" className="mb-4 rounded-xl border border-[var(--app-critical)] bg-[var(--app-critical-soft)] px-4 py-3 text-sm text-[var(--app-critical)]">{error}</p>}
    {loading ? <p className="text-sm text-[var(--app-faint)]">Reading the pool area…</p>
      : tables.length === 0 ? <p className="text-sm text-[var(--app-faint)]">No pool tables are set up for this branch yet.</p>
      : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((table) => {
          const s = table.session;
          return <div key={table.id} className="surface rounded-2xl p-4" data-testid={`pool-${table.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold">{table.name}</h3>
                <p className="mt-0.5 text-xs text-[var(--app-muted)]">
                  {money(table.rate)} per hour
                  {table.minimumMinutes > 0 ? ` · ${table.minimumMinutes} min minimum` : ''}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${s ? 'bg-[var(--app-success-soft)] text-[var(--app-success)]' : table.hasRate ? 'bg-[var(--app-raised)] text-[var(--app-muted)]' : 'bg-[var(--app-critical-soft)] text-[var(--app-critical)]'}`}>
                {s ? (s.status === 'PAUSED' ? 'Paused' : 'In play') : table.hasRate ? 'Free' : 'No rate'}
              </span>
            </div>
            {s ? <>
              <p className="mt-4 font-mono text-3xl font-semibold tabular-nums text-[var(--app-ink)]">{formatDuration(s.elapsedSeconds)}</p>
              <p className="mt-1 text-sm text-[var(--app-muted)]">Running total <span className="font-mono text-[var(--app-gold)]">{money(s.accrued)}</span></p>
              <div className="mt-4 flex flex-wrap gap-2">
                {s.status === 'ACTIVE'
                  ? <button onClick={() => void act(table.id, 'PAUSE')} disabled={busy !== null} className="inline-flex min-h-10 items-center rounded-xl border border-[var(--app-line)] px-3 text-sm font-semibold text-[var(--app-ink-soft)] hover:bg-[var(--app-raised)] disabled:opacity-50">Pause</button>
                  : <button onClick={() => void act(table.id, 'RESUME')} disabled={busy !== null} className="inline-flex min-h-10 items-center rounded-xl border border-[var(--app-line)] px-3 text-sm font-semibold text-[var(--app-ink-soft)] hover:bg-[var(--app-raised)] disabled:opacity-50">Resume</button>}
                <button onClick={() => void act(table.id, 'END')} disabled={busy !== null} className="inline-flex min-h-10 items-center rounded-xl bg-[var(--app-gold)] px-3 text-sm font-semibold text-[var(--app-ink)] hover:opacity-90 disabled:opacity-50">End game</button>
              </div>
            </> : <button onClick={() => void start(table.id)} disabled={busy !== null || !table.hasRate}
                className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[var(--app-gold)] text-sm font-semibold text-[var(--app-ink)] hover:opacity-90 disabled:opacity-40"
                title={table.hasRate ? 'Start a game' : 'This table has no rate configured'}>
              {table.hasRate ? 'Start game' : 'No rate configured'}
            </button>}
          </div>;
        })}
      </div>}
  </div>;
}

function Orders() {
  const orders = useGetOrders();
  const columns = [{ key: 'PENDING', label: 'New', color: 'bg-[var(--app-info-soft)]' }, { key: 'ACCEPTED', label: 'Accepted', color: 'bg-[var(--app-success-soft)]' }, { key: 'PREPARING', label: 'Preparing', color: 'bg-[var(--app-warn-soft)]' }, { key: 'READY', label: 'Ready', color: 'bg-[var(--app-critical-soft)]' }, { key: 'SERVED', label: 'Served', color: 'bg-[var(--app-warn-soft)]' }];
  const activeCount = (orders.data ?? []).filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;
  return <div className="rise"><PageIntro eyebrow={`Service queue / ${activeCount} active`} title="Keep the pass moving." detail="Bar and kitchen orders, grouped by where they are in the rhythm." action={<Button variant="outline" onClick={() => orders.refetch()} data-testid="button-refresh-orders"><RefreshCw size={15} /> Refresh</Button>} /><QueryNotice loading={orders.isLoading} error={orders.error} what="orders" empty={!orders.isLoading && !orders.isError && !orders.data?.length} onRetry={() => orders.refetch()} /><div className="mobile-scroll grid min-w-[840px] grid-cols-4 gap-4">{columns.map((column) => { const items = orders.data?.filter((order) => order.status === column.key) ?? []; return <section key={column.key} className="min-h-[420px] rounded-2xl bg-[var(--app-warn-soft)] p-3"><div className="mb-3 flex items-center justify-between px-1"><span className="flex items-center gap-2 text-sm font-bold"><i className={`h-2.5 w-2.5 rounded-full ${column.color}`} />{column.label}</span><span className="grid h-6 min-w-6 place-items-center rounded-full bg-[var(--app-raised)] px-1.5 font-mono text-[10px] text-[var(--app-faint)]">{items.length}</span></div><div className="grid gap-3">{items.map((order) => <article key={order.id} className="surface rounded-xl p-4" data-testid={`card-order-${order.id}`}><div className="flex items-center justify-between"><span className="font-mono text-xs font-medium text-[var(--app-gold)]">#{order.number}</span><span className="text-xs text-[var(--app-faint)]">{timeAgo(order.createdAt)}</span></div><div className="mt-2 flex items-center justify-between"><h3 className="font-display text-lg font-bold">{order.table}</h3><span className="rounded-full bg-[var(--app-success-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--app-success)]">{order.status}</span></div><ul className="mt-3 border-t border-[var(--app-line-soft)] pt-2 text-xs leading-6 text-[var(--app-ink-soft)]">{order.items.map((item, i) => <li key={`${order.id}-${i}`} className="flex gap-2"><span className="font-mono text-[var(--app-gold)]">•</span>{item}</li>)}</ul></article>)}</div></section> })}</div></div>;
}

function Inventory() {
  const alerts = useGetInventoryAlerts();
  const products = useGetProducts();
  return <div className="rise"><PageIntro eyebrow="Stock room / visibility" title="Keep the bar ready." detail="Low-stock alerts and sellable catalog, in one clean handoff for the next shift." action={<Button variant="outline" onClick={() => { alerts.refetch(); products.refetch(); }} data-testid="button-refresh-inventory"><RefreshCw size={15} /> Sync stock</Button>} /><div className="grid gap-5 xl:grid-cols-[1.1fr_1.9fr]"><section className="surface rounded-2xl p-5"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-faint)]">Needs action</p><h3 className="font-display text-xl font-bold">Low stock alerts</h3></div><span className="rounded-full bg-[var(--app-critical-soft)] px-2.5 py-1 font-mono text-xs text-[var(--app-critical)]">{alerts.data?.length ?? 0}</span></div><QueryNotice loading={alerts.isLoading} error={alerts.error} what="stock alerts" empty={!alerts.isLoading && !alerts.isError && !alerts.data?.length} onRetry={() => alerts.refetch()} />{alerts.data?.map((a) => <div key={a.id} className="flex items-center gap-3 border-b border-[var(--app-line-soft)] py-3 last:border-0"><div className={`grid h-9 w-9 place-items-center rounded-xl ${a.severity === 'OUT' ? 'bg-[var(--app-critical-soft)] text-[var(--app-critical)]' : 'bg-[var(--app-warn-soft)] text-[var(--app-warn)]'}`}><Package size={15} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.name}</p><p className="text-xs text-[var(--app-muted)]">{a.category} · min {a.minimum} {a.unit}</p></div><span className={`font-mono text-sm font-medium ${a.severity === 'OUT' ? 'text-[var(--app-critical)]' : 'text-[var(--app-warn)]'}`}>{a.stock} {a.unit}</span></div>)}</section><section className="surface rounded-2xl p-5"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-faint)]">Sellable catalog</p><h3 className="font-display text-xl font-bold">What the team can ring</h3></div><span className="text-xs text-[var(--app-muted)]">{products.data?.length ?? 0} products</span></div><QueryNotice loading={products.isLoading} error={products.error} what="products" empty={!products.isLoading && !products.isError && !products.data?.length} onRetry={() => products.refetch()} /><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-[var(--app-line-soft)] text-[10px] uppercase tracking-[.13em] text-[var(--app-muted)]"><th className="pb-3 font-medium">Product</th><th className="pb-3 font-medium">Category</th><th className="pb-3 font-medium">Price</th><th className="pb-3 font-medium">Stock</th><th className="pb-3 text-right font-medium">Status</th></tr></thead><tbody>{products.data?.map((p) => <tr key={p.id} className="border-b border-[var(--app-line-soft)] last:border-0" data-testid={`row-product-${p.id}`}><td className="py-3 font-semibold">{p.name}</td><td className="py-3 text-[var(--app-muted)]">{p.category}</td><td className="py-3 font-mono text-xs">{money(p.price)}</td><td className="py-3 font-mono text-xs">{p.stock} {p.unit}</td><td className="py-3 text-right"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${p.available ? 'bg-[var(--app-success-soft)] text-[var(--app-success)]' : 'bg-[var(--app-critical-soft)] text-[var(--app-critical)]'}`}>{p.available ? 'Available' : 'Hidden'}</span></td></tr>)}</tbody></table></div></section></div></div>;
}

function Reservations() {
  const reservations = useGetReservations();
  const [open, setOpen] = useState(false);
  const create = useCreateReservation();
  const qc = useQueryClient();
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); create.mutate({ data: { customer: String(data.get('customer')), phone: String(data.get('phone')), date: String(data.get('date')), time: String(data.get('time')), table: String(data.get('table')), guests: Number(data.get('guests')), notes: null } }, { onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: getGetReservationsQueryKey() }); } }); };
  return <div className="rise"><PageIntro eyebrow="Bookings / tonight" title="Make room for people." detail="Upcoming reservations, clearly handed to the floor team before doors open." action={<Button onClick={() => setOpen(true)} data-testid="button-new-reservation"><Plus size={16} /> New reservation</Button>} /><section className="surface overflow-hidden rounded-2xl"><div className="flex items-center justify-between border-b border-[var(--app-line-soft)] p-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-faint)]">Next 24 hours</p><h3 className="font-display text-xl font-bold">Reservation book</h3></div><button className="rounded-lg p-2 text-[var(--app-muted)] hover:bg-[var(--app-warn-soft)]" onClick={() => reservations.refetch()} data-testid="button-refresh-reservations"><RefreshCw size={16} /></button></div><QueryNotice loading={reservations.isLoading} error={reservations.error} what="reservations" empty={!reservations.isLoading && !reservations.isError && !reservations.data?.length} onRetry={() => reservations.refetch()} />{reservations.data?.map((r) => <div key={r.id} className="grid gap-3 border-b border-[var(--app-line-soft)] p-5 last:border-0 md:grid-cols-[110px_1.3fr_1fr_120px_120px] md:items-center" data-testid={`row-reservation-${r.id}`}><div><span className="block font-display text-xl font-bold">{r.time}</span><span className="font-mono text-[10px] uppercase text-[var(--app-muted)]">{r.date}</span></div><div><p className="font-semibold">{r.customer}</p><p className="text-xs text-[var(--app-muted)]">{r.phone}</p></div><div className="text-sm text-[var(--app-ink-soft)]"><span className="font-medium text-[var(--app-ink)]">{r.table}</span> · {r.guests} guests</div><span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold ${r.status === 'CONFIRMED' ? 'bg-[var(--app-success-soft)] text-[var(--app-success)]' : 'bg-[var(--app-warn-soft)] text-[var(--app-warn)]'}`}>{r.status}</span><button className="w-fit text-left text-xs font-semibold text-[var(--app-success)] md:text-right" data-testid={`button-reservation-${r.id}`}>View details <ChevronRight className="inline" size={13} /></button></div>)}</section>{open && <Modal title="Add reservation" onClose={() => setOpen(false)}><form onSubmit={submit} className="grid gap-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Customer"><input name="customer" required placeholder="Full name" data-testid="input-reservation-customer" /></Field><Field label="Phone"><input name="phone" required placeholder="+254 7..." data-testid="input-reservation-phone" /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Date"><input name="date" required type="date" data-testid="input-reservation-date" /></Field><Field label="Time"><input name="time" required type="time" data-testid="input-reservation-time" /></Field></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Table"><input name="table" required placeholder="T-08" data-testid="input-reservation-table" /></Field><Field label="Guests"><input name="guests" required min="1" type="number" placeholder="4" data-testid="input-reservation-guests" /></Field></div><Button className="mt-2 w-full" disabled={create.isPending} data-testid="button-save-reservation">{create.isPending ? 'Saving…' : 'Save reservation'}</Button></form></Modal>}</div>;
}

function Settings() {
  const settingsBranches = useGetBranches();
  return <div className="rise"><PageIntro eyebrow="Workspace / admin" title="Settings without the maze." detail="A calm place for organization preferences, branch controls, and team access." /><div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><section className="surface rounded-2xl p-6"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--app-gold-soft)] text-[var(--app-critical)]"><Store size={21} /></div><h3 className="mt-5 font-display text-2xl font-bold">Organization settings</h3><p className="mt-2 text-sm leading-6 text-[var(--app-muted)]">Your organization is connected to Dunda. Fine-grain permissions, receipts, and integrations will live here.</p><div className="mt-6 rounded-xl bg-[var(--app-bg)] p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[.1em] text-[var(--app-muted)]">Workspace status</span><span className="flex items-center text-xs font-semibold text-[var(--app-success)] status-dot">{settingsBranches.data?.length ? 'Operational' : 'No branches yet'}</span></div>{settingsBranches.data?.length ? <ul className="mt-2 grid gap-1">{settingsBranches.data.map((b) => <li key={b.id} className="flex items-center justify-between text-sm"><span className="font-semibold">{b.name}</span><span className="text-xs text-[var(--app-muted)]">{b.city} · {b.status}</span></li>)}</ul> : <p className="mt-2 text-sm text-[var(--app-muted)]">No branches are configured yet.</p>}</div></section><section className="surface rounded-2xl p-6"><div className="mb-6 flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--app-faint)]">Configuration</p><h3 className="font-display text-xl font-bold">Branch controls</h3></div><SlidersHorizontal size={18} className="text-[var(--app-muted)]" /></div>{['Receipt preferences', 'Staff roles & access', 'Payment methods', 'Service charge rules'].map((label, i) => <button key={label} className="flex w-full items-center justify-between border-b border-[var(--app-line-soft)] py-4 text-left last:border-0" data-testid={`button-setting-${i}`}><span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-[var(--app-muted)]">Available in your next setup pass</span></span><ChevronRight size={16} className="text-[var(--app-ink-soft)]" /></button>)}</section></div></div>; }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--app-info)]/45 p-4"><div className="w-full max-w-md rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-5 shadow-2xl md:p-6" role="dialog" aria-modal="true"><div className="mb-5 flex items-center justify-between"><h3 className="font-display text-2xl font-bold">{title}</h3><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--app-muted)] hover:bg-[var(--app-line-soft)]" data-testid="button-close-modal"><X size={18} /></button></div>{children}</div></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5 text-xs font-semibold text-[var(--app-faint)]">{label}{children}</label>; }

/**
 * Blocks a screen the signed-in role may not use.
 *
 * Hiding the link is a courtesy; this is the actual guard, so a typed path or a
 * bookmark cannot reach it. The server still refuses the underlying calls.
 */
/**
 * Gates the operator console inside the club app.
 *
 * The link only appears for an operator, so this is a second line rather than the
 * boundary: the API answers a non-operator exactly as it answers an unknown path.
 * A refusal here renders that same not-found, so typing the path learns nothing.
 */
function RequireOperator({ children }: { children: ReactNode }) {
  const me = useGetMe();
  if (me.isLoading) {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-[var(--app-ink-soft)]">Checking…</div>;
  }
  // A failed /me means the session is signed in but has no club, which the
  // router above already handles. Reaching here means a real answer arrived and it
  // was not yes, so say that rather than claiming the page is missing.
  if (!me.data || me.data.operator !== true) return <NotAnOperator />;
  return <>{children}</>;
}

const wrap =
  (permission: string, element: ReactNode) =>
  function GuardedRoute() {
    return <Require permission={permission}>{element}</Require>;
  };

/** A client detail route needs its id from the path. */
function OperatorClientRoute() {
  const params = useParams<{ id: string }>();
  return (
    <RequireOperator>
      <OperatorClientDetail id={params.id} />
    </RequireOperator>
  );
}

function Require({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const me = useGetMe();
  if (me.isLoading) {
    return <div className="grid min-h-[60vh] place-items-center text-sm text-[var(--app-ink-soft)]">Checking your access…</div>;
  }
  if (me.data && !me.data.isOwner && !me.data.permissions.includes(permission)) {
    return (
      <div className="surface mx-auto max-w-md rounded-2xl p-6 text-center">
        <h2 className="font-display text-xl font-bold">This screen is not available to your role</h2>
        <p className="mt-2 text-sm text-[var(--app-ink-soft)]">
          Ask a manager for the {PERMISSION_LABELS[permission] ?? permission} permission.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function Auth({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  // A session that ended on its own sends the person here; saying why is the
  // difference between "the app is broken" and "please sign in again".
  const sessionEnded = (() => {
    try {
      const flag = window.sessionStorage.getItem('dunda:session-ended') === '1';
      if (flag) window.sessionStorage.removeItem('dunda:session-ended');
      return flag;
    } catch {
      return false;
    }
  })();
  return <div className="grid min-h-[100dvh] bg-[var(--app-chrome)] lg:grid-cols-[1fr_1fr]"><div className="hidden flex-col justify-between p-10 lg:flex"><Logo dark /><div className="max-w-lg pb-10"><p className="font-mono text-xs uppercase tracking-[.2em] text-[var(--app-gold)]">The operating system for after hours</p><h1 className="mt-5 font-display text-6xl font-extrabold leading-[.93] tracking-[-.06em] text-[var(--app-chrome-ink)]">Own the night.<br /><span className="text-[var(--app-success)]">Together.</span></h1><p className="mt-6 max-w-sm text-sm leading-6 text-[var(--app-ink-soft)]">Dunda brings the room, the rail, and the floor into one live view — so your team can move with the night.</p></div><div className="flex items-center gap-2 text-xs text-[var(--app-faint)]"><span className="h-2 w-2 rounded-full bg-[var(--app-success)]" /> Live operations, without the noise</div></div><div className="grid place-items-center bg-[var(--app-bg)] p-5 sm:p-10"><div className="w-full max-w-[440px]">{sessionEnded && mode === 'sign-in' && <div className="mb-4 rounded-xl border border-[var(--app-warn)] bg-[var(--app-warn-soft)] px-4 py-3 text-sm text-[var(--app-warn)]" role="status">Your session ended. Please sign in again to continue.</div>}{mode === 'sign-in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}</div></div></div>;
}

function Landing() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/overview" />;
  return <div className="app-noise min-h-[100dvh] bg-[var(--app-bg)]"><header className="flex items-center justify-between px-5 py-5 md:px-10"><Logo /><div className="flex items-center gap-2"><Link href="/sign-in" className="rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[var(--app-ink-soft)] hover:bg-[var(--app-line)]" data-testid="link-landing-sign-in">Sign in</Link><Link href="/sign-up" className="rounded-xl bg-[var(--app-gold)] px-3.5 py-2.5 text-sm font-semibold text-[var(--app-ink)] hover:bg-[var(--app-gold)]" data-testid="link-landing-sign-up">Start free</Link></div></header><main><section className="mx-auto grid max-w-[1420px] gap-12 px-5 pb-20 pt-14 md:px-10 md:pt-24 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:pb-28"><div className="max-w-2xl"><p className="rise font-mono text-xs uppercase tracking-[.22em] text-[var(--app-gold)]">Built for the live shift</p><h1 className="rise delay-1 mt-6 font-display text-[clamp(3.5rem,8vw,7.7rem)] font-extrabold leading-[.88] tracking-[-.08em] text-[var(--app-ink)]">The room<br /><span className="text-[var(--app-success)]">is yours.</span></h1><p className="rise delay-2 mt-8 max-w-lg text-lg leading-8 text-[var(--app-ink-soft)]">Dunda is the club operating system for bars, lounges, and venues that move fast. One clear view of sales, tabs, tables, and the team keeping the night alive.</p><div className="rise delay-3 mt-9 flex flex-wrap gap-3"><Link href="/sign-up" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--app-gold)] px-5 text-sm font-bold text-[var(--app-ink)] hover:bg-[var(--app-gold)]" data-testid="link-landing-primary">Open your venue <ChevronRight size={17} /></Link><Link href="/sign-in" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--app-warn-soft)] px-5 text-sm font-bold text-[var(--app-success)] hover:border-[var(--app-gold)]" data-testid="link-landing-secondary">Sign in <ArrowUpRight size={16} /></Link></div><div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--app-faint)]"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--app-success)]" /> Live floor view</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--app-gold)]" /> Fast POS</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--app-warn)]" /> Shift-ready</span></div></div><div className="relative"><div className="absolute -inset-8 rounded-[3rem] bg-[var(--app-success-soft)] opacity-70 blur-3xl" /><div className="relative rotate-1 rounded-[1.7rem] border border-[var(--app-line)] bg-[var(--app-chrome)] p-3 shadow-2xl"><div className="rounded-[1.25rem] bg-[var(--app-raised)] p-4 md:p-6"><div className="flex items-center justify-between border-b border-[var(--app-warn-soft)] pb-5"><div><p className="font-mono text-[9px] uppercase tracking-[.16em] text-[var(--app-muted)]">Tonight at a glance</p><h3 className="mt-1 font-display text-xl font-bold">Run the room.</h3></div><span className="rounded-full bg-[var(--app-success-soft)] px-2 py-1 text-[9px] font-bold text-[var(--app-success)]">LIVE</span></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[var(--app-gold)] p-3"><p className="text-[9px] uppercase tracking-[.1em] opacity-65">Revenue tonight</p><p className="mt-2 font-display text-2xl font-bold">KES 184,720</p><p className="mt-1 text-[10px] opacity-65">+12.4% vs last Tue</p></div><div className="rounded-xl bg-[var(--app-success-soft)] p-3"><p className="text-[9px] uppercase tracking-[.1em] text-[var(--app-success)]">Open tabs</p><p className="mt-2 font-display text-2xl font-bold text-[var(--app-success)]">18</p><p className="mt-1 text-[10px] text-[var(--app-success)]">7 tables active</p></div></div><div className="mt-4 rounded-xl border border-[var(--app-warn-soft)] bg-[var(--app-surface)] p-3"><div className="mb-4 flex items-center justify-between"><span className="font-semibold text-xs">Revenue flow</span><span className="font-mono text-[9px] text-[var(--app-faint)]">This shift</span></div><div className="flex h-24 items-end gap-2">{[32, 46, 38, 58, 51, 72, 87, 64, 92, 70].map((h, i) => <div key={i} className={`flex-1 rounded-t-sm ${i === 8 ? 'bg-[var(--app-gold)]' : 'bg-[var(--app-success-soft)]'}`} style={{ height: `${h}%` }} />)}</div></div><p className="mt-4 text-center text-[9px] uppercase tracking-[.14em] text-[var(--app-muted)]">Sample interface</p></div></div><span className="absolute -bottom-5 -left-5 hidden rounded-xl bg-[var(--app-gold)] px-3 py-2 font-mono text-[10px] font-medium text-[var(--app-ink)] shadow-lg sm:block">Illustrative preview</span></div></section><section className="border-y border-[var(--app-line)] bg-[var(--app-line)]"><div className="mx-auto grid max-w-[1420px] gap-px bg-[var(--app-line)] md:grid-cols-3">{[{ icon: Grid2X2, title: 'See the room', text: 'Tables, reservations, and payments in one live floor view.' }, { icon: WalletCards, title: 'Move the rail', text: 'Tap-to-ring POS that keeps service moving, not waiting.' }, { icon: BarChart3, title: 'Close with clarity', text: 'Shift summaries that tell you what happened while it was happening.' }].map(({ icon: Icon, title, text }) => <div key={title} className="bg-[var(--app-line)] p-7 md:p-10"><Icon size={22} className="mb-8 text-[var(--app-gold)]" /><h3 className="font-display text-xl font-bold">{title}</h3><p className="mt-2 max-w-xs text-sm leading-6 text-[var(--app-faint)]">{text}</p></div>)}</div></section></main><footer className="mx-auto flex max-w-[1420px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-[var(--app-muted)] md:px-10"><Logo /><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span>© {new Date().getFullYear()} Dunda</span><span aria-hidden>·</span><a href={VENDOR_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--app-faint)] underline decoration-[var(--app-warn-soft)] underline-offset-4 transition-colors hover:text-[var(--app-gold)] hover:decoration-[var(--app-gold)]" data-testid="link-built-by">Built and maintained by {VENDOR_NAME}</a></div></footer></div>;
}

function ProtectedRouter() {
  const { isLoaded, isSignedIn } = useAuth();
  const [pathname] = useLocation();
  useApiAuth();
  useSessionGuard();
  // Serverless hosting cannot hold a WebSocket open, so live screens poll.
  useLiveRefresh(Boolean(isSignedIn));
  // A 403 here means the account is signed in but not yet
  // linked to a Dunda staff record. Without this the user just sees empty
  // screens and has no idea why.
  const me = useGetMe();
  const { user } = useUser();
  const isOperator = me.data?.operator === true;
  const meError = me.error as {
    status?: number;
    data?: { code?: string; reason?: string };
  } | null;
  // An operator is never blocked here. They may own no club yet, which is the
  // normal state for someone who provisions clients, so refusing them would
  // leave the console unreachable exactly when it is needed.
  const unlinked =
    !isOperator &&
    me.isError &&
    (me.error as { status?: number })?.status === 403;
  const suspendedClub =
    !isOperator &&
    me.isError &&
    meError?.data?.code === "ORGANIZATION_SUSPENDED";
  if (!isLoaded) return <div className="grid min-h-[100dvh] place-items-center bg-[var(--app-bg)] text-sm text-[var(--app-ink-soft)]">Loading your workspace…</div>;

  // A platform operator lands on the console; anybody else lands on their own
  // first screen. Only for a session with no club, since an operator may also be
  // staff and the club screens are then the right ones.
  const home = isOperator && !me.data?.staff ? '/admin' : landingFor(me.data?.permissions);
  if (isSignedIn && me.data && home && pathname === '/') {
    return <Redirect to={home} />;
  }
  if (isSignedIn && suspendedClub) {
    return <div className="grid min-h-[100dvh] place-items-center gap-4 bg-[var(--app-bg)] p-6">
      <div className="surface max-w-md rounded-2xl p-6 text-center">
        <h1 className="font-display text-2xl font-bold">This club has been disabled</h1>
        <p className="mt-2 text-sm text-[var(--app-ink-soft)]">
          {meError?.data?.reason ?? "The platform has suspended the club you belong to."}
        </p>
        <p className="mt-3 text-xs text-[var(--app-faint)]">
          Signed in as {user?.primaryEmailAddress?.emailAddress ?? "this account"}. Ask the platform owner to reinstate the club.
        </p>
      </div>
    </div>;
  }
  if (isSignedIn && unlinked) {
    return <div className="grid min-h-[100dvh] place-items-center gap-4 bg-[var(--app-bg)] p-6">
      <div className="surface max-w-md rounded-2xl p-6 text-center">
        <h1 className="font-display text-2xl font-bold">You're signed in, but not on the roster yet</h1>
        <p className="mt-2 text-sm text-[var(--app-ink-soft)]">
          A manager has to add you to the club and give you a role before any of
          the screens open. Your account is fine — there is just nothing attached
          to it yet.
        </p>
        {/* What to ask for, and what to ask with. "Contact whoever" with no
            address is the message somebody sends when they have already been
            turned away once. */}
        <ol className="mt-4 grid gap-2 text-left text-sm text-[var(--app-muted)]">
          <li className="flex gap-2"><span className="font-mono text-xs text-[var(--app-gold)]">1</span><span>Ask a manager to add <span className="font-semibold text-[var(--app-ink)]">{user?.primaryEmailAddress?.emailAddress ?? 'this account'}</span> to the staff list.</span></li>
          <li className="flex gap-2"><span className="font-mono text-xs text-[var(--app-gold)]">2</span><span>They pick a role. The role is what decides your tabs — nothing is set individually.</span></li>
          <li className="flex gap-2"><span className="font-mono text-xs text-[var(--app-gold)]">3</span><span>Your tabs appear as soon as you open the app again. No sign-out needed.</span></li>
        </ol>
        <button onClick={() => void me.refetch()} className="mt-5 inline-flex min-h-10 items-center rounded-xl border border-[var(--app-line)] px-4 text-sm font-semibold text-[var(--app-ink-soft)] hover:bg-[var(--app-raised)]">I've been added — check again</button>
        <p className="mt-3 text-xs text-[var(--app-faint)]">Signed in as {user?.primaryEmailAddress?.emailAddress ?? 'this account'}.</p>
      </div>
    </div>;
  }
  // An operator is never bounced to the console from here. They land on the
  // dashboard like anybody else, and the console is one click away in the nav.
  // Redirecting them would mean the dashboard's own admin entry could never be
  // used, and it used to loop for an operator with no club.

  return isSignedIn ?     <AppShell><Switch><Route path="/admin" component={() => <RequireOperator><OperatorOverview /></RequireOperator>} />
<Route path="/admin/clubs" component={() => <RequireOperator><OperatorClients /></RequireOperator>} />
<Route path="/admin/billing" component={() => <RequireOperator><OperatorBilling /></RequireOperator>} />
<Route path="/admin/clients/:id" component={OperatorClientRoute} />
<Route path="/admin/new" component={() => <RequireOperator><OperatorNewClient /></RequireOperator>} />
<Route path="/admin/people" component={() => <RequireOperator><OperatorPeople /></RequireOperator>} />
<Route path="/admin/audit" component={() => <RequireOperator><OperatorAudit /></RequireOperator>} />
<Route path="/admin/plans" component={() => <RequireOperator><OperatorPlans /></RequireOperator>} /><Route path="/admin/subscriptions" component={() => <RequireOperator><OperatorSubscriptions /></RequireOperator>} /><Route path="/admin/support" component={() => <RequireOperator><OperatorSupport /></RequireOperator>} /><Route path="/admin/system" component={() => <RequireOperator><OperatorSystem /></RequireOperator>} />
<Route path="/overview" component={Overview} /><Route path="/pos" component={wrap("view_pos", <NewPos />)} /><Route path="/floor" component={wrap("view_pos", <Floor />)} /><Route path="/designer" component={wrap("manage_floor", <FloorDesigner />)} /><Route path="/orders" component={wrap("view_orders", <Orders />)} /><Route path="/pool" component={wrap("manage_pool", <Pool />)} /><Route path="/bar" component={wrap("update_ticket", <ServiceBoard station="bar" />)} /><Route path="/kitchen" component={wrap("update_ticket", <ServiceBoard station="kitchen" />)} /><Route path="/products" component={wrap("manage_products", <Products />)} /><Route path="/inventory" component={wrap("view_inventory", <Inventory />)} /><Route path="/staff" component={wrap("manage_staff", <Staff />)} /><Route path="/customers" component={wrap("manage_customers", <Customers />)} /><Route path="/customers/new" component={wrap("manage_customers", <NewCustomer />)} /><Route path="/events" component={wrap("manage_events", <Events />)} /><Route path="/reservations" component={wrap("manage_reservations", <Reservations />)} /><Route path="/reports" component={wrap("view_reports", <Reports />)} /><Route path="/hq" component={wrap("view_reports", <Hq />)} /><Route path="/settings" component={wrap("manage_roles", <Settings />)} /><Route component={NotFound} /></Switch></AppShell> : <Redirect to="/" />;
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
  // Wouter's own location, not the bare `location` global. The ErrorBoundary's
  // reset key has to track the route so a caught error clears when the person
  // navigates somewhere else; reading the global here would read window.location,
  // which is why it looked fine and was not.
  const [location] = useLocation();
  return <WouterRouter base={basePath}><ClerkProvider publishableKey={resolveClerkPublishableKey()} proxyUrl={clerkProxyUrl} appearance={{ theme: shadcn, cssLayerName: 'clerk', options: { logoPlacement: 'inside', logoLinkUrl: basePath || '/', logoImageUrl: logoImageUrl() }, variables: { colorPrimary: 'hsl(var(--app-gold))', colorForeground: 'var(--app-ink)', colorMutedForeground: 'var(--app-ink-soft)', colorDanger: 'var(--app-critical)', colorBackground: 'var(--app-surface)', colorInput: 'var(--app-surface)', colorInputForeground: 'var(--app-ink)', colorNeutral: 'var(--app-line)', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.75rem' }, elements: { rootBox: 'w-full flex justify-center', cardBox: 'bg-[var(--app-surface)] rounded-2xl w-[440px] max-w-full overflow-hidden', card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none', headerTitle: 'text-[var(--app-ink)]', headerSubtitle: 'text-[var(--app-ink-soft)]', socialButtonsBlockButtonText: 'text-[var(--app-ink)]', formFieldLabel: 'text-[var(--app-ink-soft)]', footerActionLink: 'text-[var(--app-gold)]', footerActionText: 'text-[var(--app-ink-soft)]', dividerText: 'text-[var(--app-ink-soft)]', formFieldInput: 'text-[var(--app-ink)] bg-white', formButtonPrimary: 'bg-[var(--app-gold)] text-[var(--app-ink)]', main: 'bg-transparent' } }} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}><QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator /><ErrorBoundary resetKey={location}><MoneyProvider><Router /></MoneyProvider></ErrorBoundary></QueryClientProvider></ClerkProvider></WouterRouter>;
}

export default App;
