
export interface HealthStatus {
  status: string;
}

export type BranchStatus = typeof BranchStatus[keyof typeof BranchStatus];


export const BranchStatus = {
  LIVE: 'LIVE',
  CLOSED: 'CLOSED',
} as const;

export interface Branch {
  id: string;
  name: string;
  city: string;
  status: BranchStatus;
  activeTables: number;
  totalTables: number;
  revenueToday: number;
}

export type TableStatus = typeof TableStatus[keyof typeof TableStatus];


export const TableStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  CLEANING: 'CLEANING',
} as const;

export interface Table {
  id: string;
  name: string;
  section: string;
  seats: number;
  status: TableStatus;
  total: number;
  
  tabId: string | null;
  
  customer?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface FloorSection {
  id: string;
  name: string;
  tables: Table[];
}

export interface Floor {
  branchId: string;
  sections: FloorSection[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  category: string;
  price: number;
  unit: string;
  baseUnit: string;
  stock: number;
  available: boolean;
  active: boolean;
  trackInventory: boolean;
  accent: string;
  
  sku?: string | null;
  
  barcode?: string | null;
  cost?: number;
  tax?: number;
  
  description?: string | null;
}

export interface ProductUnit {
  id: string;
  productId: string;
  name: string;
  abbreviation: string;
  conversionFactor: number;
  sellingPrice: number;
  
  cost?: number | null;
  wholeUnitsOnly: boolean;
  isBaseUnit?: boolean;
  sortOrder?: number;
}

export interface TabItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category: string;
  
  unitId?: string | null;
  
  unitName?: string | null;
  
  notes?: string | null;
}

export type TabStatus = typeof TabStatus[keyof typeof TabStatus];


export const TabStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export interface Tab {
  id: string;
  number: string;
  customer: string;
  table: string;
  status: TabStatus;
  items: TabItem[];
  subtotal: number;
  serviceCharge: number;
  tax: number;
  discount: number;
  total: number;
  amountPaid: number;
  outstanding: number;
  openedAt: string;
}

export interface TabInput {
  
  customer: string;
  
  table: string;
  
  tableId?: string | null;
  
  branchId?: string | null;
}

export interface TabItemInput {
  productId: string;
  
  quantity: number;
  
  unitId?: string | null;
  
  notes?: string | null;
}

export type CheckoutInputMethod = typeof CheckoutInputMethod[keyof typeof CheckoutInputMethod];


export const CheckoutInputMethod = {
  CASH: 'CASH',
  MPESA: 'MPESA',
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  OTHER: 'OTHER',
} as const;

export interface CheckoutInputPayment {
  method: CheckoutInputMethod;
  
  amount: number;
  
  reference?: string | null;
  
  paidBy?: string | null;
}

export interface CheckoutInput {
  payments: CheckoutInputPayment[];
  
  idempotencyKey?: string | null;
}


export interface PendingCheckoutResult {
  status: "PENDING";
  attemptId: string;
  orderTrackingId: string;
  redirectUrl: string;
  amount: number;
  currency: string;
  method: string;
}

export interface CheckoutPayment {
  id: string;
  method: string;
  amount: number;
  reference: string | null;
}

export interface CheckoutReceipt {
  id: string;
  number: string;
  total: number;
  issuedAt: string;
}


export interface SettledCheckoutResult {
  tab: {
    id: string;
    number: string;
    total: number;
    outstanding: number;
    status: string;
  };
  payments: CheckoutPayment[];
  receipt: CheckoutReceipt;
  tabClosed: boolean;
}

export type CheckoutResult = PendingCheckoutResult | SettledCheckoutResult;

export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];


export const OrderStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export interface Order {
  id: string;
  number: string;
  
  table: string | null;
  status: OrderStatus;
  items: string[];
  
  subtotal?: number | null;
  
  serviceCharge?: number | null;
  
  tax?: number | null;
  
  discount?: number | null;
  
  total?: number | null;
  
  notes?: string | null;
  createdAt: string;
}

export type CreateOrderInputItemsItem = {
  productId: string;
  
  quantity: number;
  
  unitId?: string | null;
  
  notes?: string | null;
};

export interface CreateOrderInput {
  table: string;
  
  tableId?: string | null;
  
  customerId?: string | null;
  
  staffId?: string | null;
  items: CreateOrderInputItemsItem[];
}

export type UpdateOrderStatusInputStatus = typeof UpdateOrderStatusInputStatus[keyof typeof UpdateOrderStatusInputStatus];


export const UpdateOrderStatusInputStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export interface UpdateOrderStatusInput {
  status: UpdateOrderStatusInputStatus;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  
  unitId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  
  notes?: string | null;
  
  categoryId?: string | null;
}

export type StaffMemberStatus = typeof StaffMemberStatus[keyof typeof StaffMemberStatus];


export const StaffMemberStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export interface StaffMember {
  id: string;
  
  clerkUserId?: string | null;
  name: string;
  
  email: string | null;
  
  phone?: string | null;
  
  role?: string | null;
  
  roleId?: string | null;
  status: StaffMemberStatus;
  
  branchId?: string | null;
  createdAt?: string;
}

export interface CreateStaffInput {
  
  clerkUserId?: string | null;
  name: string;
  
  email: string | null;
  
  phone?: string | null;
  roleId: string;
  
  branchId?: string | null;
}

export type StaffShiftStatus = typeof StaffShiftStatus[keyof typeof StaffShiftStatus];


export const StaffShiftStatus = {
  DRAFT: 'DRAFT',
  RUNNING: 'RUNNING',
  CLOSED: 'CLOSED',
} as const;

export interface StaffShift {
  id: string;
  staffId: string;
  
  staffName?: string | null;
  
  clockInAt?: string | null;
  
  clockOutAt?: string | null;
  
  breakStartAt?: string | null;
  
  breakEndAt?: string | null;
  status: StaffShiftStatus;
  
  notes?: string | null;
  createdAt?: string;
}

export interface CreateShiftInput {
  staffId: string;
  
  branchId?: string | null;
  
  notes?: string | null;
}

export type CustomerVipLevel = typeof CustomerVipLevel[keyof typeof CustomerVipLevel];


export const CustomerVipLevel = {
  NONE: 'NONE',
  BRONZE: 'BRONZE',
  SILVER: 'SILVER',
  GOLD: 'GOLD',
  PLATINUM: 'PLATINUM',
} as const;

export interface Customer {
  id: string;
  name: string;
  
  phone?: string | null;
  
  email?: string | null;
  vipLevel?: CustomerVipLevel;
  totalVisits?: number;
  totalSpend?: number;
  
  lastVisitAt?: string | null;
  
  notes?: string | null;
  createdAt?: string;
}

export interface CreateCustomerInput {
  name: string;
  
  phone?: string | null;
  
  email?: string | null;
  
  notes?: string | null;
}

export type EventStatus = typeof EventStatus[keyof typeof EventStatus];


export const EventStatus = {
  DRAFT: 'DRAFT',
  UPCOMING: 'UPCOMING',
  LIVE: 'LIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export interface Event {
  id: string;
  name: string;
  
  description?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  status: EventStatus;
  revenue?: number;
}

export interface CreateEventInput {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  
  capacity: number;
  
  description?: string | null;
  
  branchId?: string | null;
}

export type ReservationStatus = typeof ReservationStatus[keyof typeof ReservationStatus];


export const ReservationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;

export interface Reservation {
  id: string;
  customer: string;
  
  customerName?: string | null;
  phone: string;
  date: string;
  time: string;
  table: string;
  guests: number;
  status: ReservationStatus;
  
  notes?: string | null;
}

export interface ReservationInput {
  
  customer: string;
  
  phone: string;
  date: string;
  
  time: string;
  
  table: string;
  
  guests: number;
  
  notes?: string | null;
}

export interface InventoryItem {
  id: string;
  
  productId?: string | null;
  name: string;
  
  category?: string | null;
  
  sku?: string | null;
  currentQuantity: number;
  reorderLevel: number;
  
  cost?: number | null;
  unit: string;
}

export type AdjustInventoryInputType = typeof AdjustInventoryInputType[keyof typeof AdjustInventoryInputType];


export const AdjustInventoryInputType = {
  PURCHASE: 'PURCHASE',
  SALE: 'SALE',
  ADJUSTMENT: 'ADJUSTMENT',
  WASTE: 'WASTE',
  RETURN: 'RETURN',
  STOCK_COUNT: 'STOCK_COUNT',
} as const;

export interface AdjustInventoryInput {
  productId: string;
  quantity: number;
  type: AdjustInventoryInputType;
  
  reason?: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  
  contact?: string | null;
  
  phone?: string | null;
  
  email?: string | null;
  
  address?: string | null;
}

export interface CreateSupplierInput {
  name: string;
  
  contact?: string | null;
  
  phone?: string | null;
  
  email?: string | null;
  
  address?: string | null;
}

export type InventoryAlertSeverity = typeof InventoryAlertSeverity[keyof typeof InventoryAlertSeverity];


export const InventoryAlertSeverity = {
  LOW: 'LOW',
  OUT: 'OUT',
} as const;

export interface InventoryAlert {
  id: string;
  name: string;
  category: string;
  stock: number;
  minimum: number;
  unit: string;
  severity: InventoryAlertSeverity;
}

export type ActivityItemType = typeof ActivityItemType[keyof typeof ActivityItemType];


export const ActivityItemType = {
  PAYMENT: 'PAYMENT',
  ORDER: 'ORDER',
  RESERVATION: 'RESERVATION',
  INVENTORY: 'INVENTORY',
  SHIFT: 'SHIFT',
} as const;

export interface ActivityItem {
  id: string;
  type: ActivityItemType;
  title: string;
  detail: string;
  
  amount: number | null;
  timestamp: string;
}

export type AuditLogAction = typeof AuditLogAction[keyof typeof AuditLogAction];


export const AuditLogAction = {
  LOGIN: 'LOGIN',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  VOID: 'VOID',
  REFUND: 'REFUND',
  ADJUST: 'ADJUST',
  APPROVE: 'APPROVE',
  DISCARD: 'DISCARD',
} as const;

export interface AuditLog {
  id: string;
  
  staffId?: string | null;
  
  staffName?: string | null;
  action: AuditLogAction;
  entity: string;
  
  entityId?: string | null;
  
  detail?: string | null;
  
  reason?: string | null;
  createdAt: string;
}

export interface MetricPoint {
  label: string;
  value: number;
}

export interface DashboardSummary {
  date: string;
  revenue: number;
  orders: number;
  averageOrderValue: number;
  activeTables: number;
  totalTables: number;
  activeTabs: number;
  
  branchId?: string | null;
  
  branchName?: string | null;
  foodRevenue: number;
  drinkRevenue: number;
  otherRevenue: number;
  
  lowStockItems?: number | null;
  
  outOfStockItems?: number | null;
  
  upcomingEvents?: number | null;
  
  reservations?: number | null;
  outstandingPayments: number;
  revenueSeries: MetricPoint[];
  categoryBreakdown: MetricPoint[];
  paymentBreakdown: MetricPoint[];
  topProducts: MetricPoint[];
}

export interface SalesReport {
  dateFrom: string;
  dateTo: string;
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  byPaymentMethod: MetricPoint[];
  byHour: MetricPoint[];
}

export interface ProductReportItem {
  name: string;
  category: string;
  quantitySold: number;
  revenue: number;
}

export type UpdateStaffInputStatus = typeof UpdateStaffInputStatus[keyof typeof UpdateStaffInputStatus];


export const UpdateStaffInputStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export interface UpdateStaffInput {
  name?: string;
  
  email?: string | null;
  
  phone?: string | null;
  roleId?: string;
  
  branchId?: string | null;
  status?: UpdateStaffInputStatus;
}

export interface SetupStatus {
  claimable: boolean;
  
  reason?: string | null;
}

export interface ClaimOwnershipInput {
  
  token: string;
}

export type UpdateTicketInputStatus = typeof UpdateTicketInputStatus[keyof typeof UpdateTicketInputStatus];


export const UpdateTicketInputStatus = {
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  CANCELLED: 'CANCELLED',
} as const;

export interface UpdateTicketInput {
  status: UpdateTicketInputStatus;
}

export interface OrderTicketItem {
  id: string;
  name: string;
  quantity: number;
  
  notes?: string | null;
}

export type OrderTicketStation = typeof OrderTicketStation[keyof typeof OrderTicketStation];


export const OrderTicketStation = {
  BAR: 'BAR',
  KITCHEN: 'KITCHEN',
} as const;

export type OrderTicketStatus = typeof OrderTicketStatus[keyof typeof OrderTicketStatus];


export const OrderTicketStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export interface OrderTicket {
  id: string;
  number: string;
  orderId: string;
  orderNumber?: string;
  
  table?: string | null;
  
  tableId?: string | null;
  
  tabId?: string | null;
  station: OrderTicketStation;
  status: OrderTicketStatus;
  
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
  items: OrderTicketItem[];
}

export interface TenantSettings {
  currency: string;
  locale: string;
  taxRate: number;
  serviceChargeRate: number;
}

export interface AdminSummary {
  clubs: number;
  liveBranches: number;
  newClubsThisMonth: number;
  activeClubs: number;
  trialClubs: number;
  suspendedClubs: number;
  cancelledClubs: number;
  expiredClubs: number;
  pastDueClubs: number;
  churnedLast30Days: number;
  
  mrr: number;
  
  collected: number;
  activeStaff: number;
  totalStaff: number;
  ordersInWindow: number;
  
  clubRevenueInWindow: number;
  windowDays: number;
}

export interface CreatedOrganization {
  id: string;
  slug: string;
  branchId: string;
  
  payment?: {
    billingPaymentId: string;
    orderTrackingId: string;
    redirectUrl: string;
    amount: number;
    currency: string;
  } | null;
  
  paymentFailed?: boolean;
}

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  currency: string;
  taxRate: number;
  serviceChargeRate: number;
  createdAt: string;
  branches: number;
  liveBranches: number;
  staff: number;
  activeStaff: number;
  tables: number;
  ordersInWindow: number;
  revenueInWindow: number;
  status: string;
  
  suspendedAt?: string | null;
  
  suspendedReason?: string | null;
  
  lastOrderAt?: string | null;
  
  plan?: string | null;
  
  subscriptionStatus?: string | null;
}

export interface CreateOrganizationInput {
  
  name: string;
  slug?: string;
  
  currency?: string;
  
  taxRate?: number;
  
  serviceChargeRate?: number;
  branchName?: string;
  city?: string;
}

export interface UpdateOrganizationInput {
  
  name?: string;
  
  currency?: string;
  
  taxRate?: number;
  
  serviceChargeRate?: number;
}

export interface AdminSubscriptionRow {
  id: string;
  organizationId: string;
  
  organization?: string | null;
  plan: string;
  planCode?: string;
  status: string;
  billingCycle: string;
  amount: number;
  currency: string;
  branchLimit?: number;
  branchUsage?: number;
  userLimit?: number;
  userUsage?: number;
  
  startedAt?: string | null;
  
  trialEndsAt?: string | null;
  trialDaysLeft?: number | null;
  
  renewsAt?: string | null;
  renewalDue: boolean;
  autoRenew: boolean;
  
  cancelledAt?: string | null;
  failedPaymentCount?: number;
  createdAt?: string;
}

export type AdminSubscriptionsCounts = {
  total: number;
  active: number;
  trial: number;
  pastDue: number;
  suspended: number;
  cancelled: number;
  expired: number;
};

export interface AdminSubscriptions {
  counts: AdminSubscriptionsCounts;
  renewalsDue: AdminSubscriptionRow[];
  subscriptions: AdminSubscriptionRow[];
}

export type AdminBillingPaymentsItem = {
  id?: string;
  organizationId?: string;
  
  organization?: string | null;
  status?: string;
  amount?: number;
  currency?: string;
  provider?: string;
  
  paidAt?: string | null;
  createdAt?: string;
};

export type AdminBillingFailedItem = {
  id?: string;
  
  organization?: string | null;
  amount?: number;
  
  reason?: string | null;
  createdAt?: string;
};

export type AdminBillingInvoicesItem = {
  id?: string;
  number?: string;
  
  organization?: string | null;
  total?: number;
  currency?: string;
  status?: string;
  issuedAt?: string;
};

export interface AdminBilling {
  collected: number;
  payments: AdminBillingPaymentsItem[];
  failed: AdminBillingFailedItem[];
  invoices: AdminBillingInvoicesItem[];
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  
  description?: string | null;
  monthlyPrice: number;
  annualPrice: number;
  
  branchLimit: number;
  userLimit: number;
  modules: string[];
  isCustom: boolean;
  isActive: boolean;
  sortOrder?: number;
}

export interface PlanInput {
  
  code: string;
  
  name: string;
  
  description?: string | null;
  
  monthlyPrice: number;
  
  annualPrice: number;
  
  branchLimit: number;
  
  userLimit: number;
  modules?: string[];
  isCustom?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface Subscription {
  id: string;
  organizationId: string;
  plan: string;
  
  planId?: string | null;
  status: string;
  billingCycle: string;
  branchLimit: number;
  userLimit: number;
  currentBranches?: number;
  currentUsers?: number;
  
  renewsAt?: string | null;
}

export type SubscriptionResultUsage = {
  branches: number;
  branchLimit: number;
  overBranchLimit?: boolean;
  users: number;
  userLimit: number;
  overUserLimit?: boolean;
};

export interface SubscriptionResult {
  subscription: Subscription;
  
  monthlyPrice?: number | null;
  usage: SubscriptionResultUsage;
  
  payment?: {
    billingPaymentId: string;
    orderTrackingId: string;
    redirectUrl: string;
    amount: number;
    currency: string;
  } | null;
}

export type SetSubscriptionInputBillingCycle = typeof SetSubscriptionInputBillingCycle[keyof typeof SetSubscriptionInputBillingCycle];


export const SetSubscriptionInputBillingCycle = {
  MONTHLY: 'MONTHLY',
  ANNUAL: 'ANNUAL',
  CUSTOM: 'CUSTOM',
} as const;

export type SetSubscriptionInputStatus = typeof SetSubscriptionInputStatus[keyof typeof SetSubscriptionInputStatus];


export const SetSubscriptionInputStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export interface SetSubscriptionInput {
  
  planId?: string | null;
  
  monthlyPrice?: number | null;
  billingCycle?: SetSubscriptionInputBillingCycle;
  status?: SetSubscriptionInputStatus;
  
  renewsAt?: string | null;
}

export interface AssignOwnerInput {
  
  clerkUserId?: string;
  name?: string;
  
  email?: string | null;
  roleId?: string;
}

export type AssignOwnerResultOwner = {
  id: string;
  name: string;
  
  clerkUserId?: string | null;
};


export type AssignOwnerResultDemoted = {
  id?: string;
  name?: string;
} | null;

export interface AssignOwnerResult {
  owner: AssignOwnerResultOwner;
  
  demoted?: AssignOwnerResultDemoted;
}

export interface AdminStaff {
  id: string;
  name: string;
  
  email?: string | null;
  status?: string;
  
  clerkUserId?: string | null;
  organizationId?: string;
  
  branchId?: string | null;
  
  roleId?: string | null;
  
  role?: string | null;
  
  organization?: string | null;
  createdAt?: string;
  linked: boolean;
}

export interface AdminAuditLog {
  id: string;
  organizationId: string;
  
  organization?: string | null;
  action: string;
  entity: string;
  
  entityId?: string | null;
  
  detail?: string | null;
  
  reason?: string | null;
  createdAt?: string;
}

export interface BranchSummary {
  id: string;
  name: string;
  
  city?: string | null;
  status: string;
}

export interface VenueSettings {
  id: string;
  name: string;
  slug?: string;
  currency: string;
  taxRate: number;
  serviceChargeRate: number;
  settings?: TenantSettings;
  branches: BranchSummary[];
}

export interface UpdateVenueSettingsInput {
  
  name?: string;
  
  currency?: string;
  
  taxRate?: number;
  
  serviceChargeRate?: number;
}

export interface CreateBranchInput {
  
  name: string;
  city?: string;
  
  address?: string | null;
  
  phone?: string | null;
  
  email?: string | null;
  timezone?: string;
}

export type UpdateBranchInputStatus = typeof UpdateBranchInputStatus[keyof typeof UpdateBranchInputStatus];


export const UpdateBranchInputStatus = {
  LIVE: 'LIVE',
  CLOSED: 'CLOSED',
} as const;

export interface UpdateBranchInput {
  
  name?: string;
  city?: string;
  
  address?: string | null;
  
  phone?: string | null;
  
  email?: string | null;
  status?: UpdateBranchInputStatus;
}


export type MeStaff = {
  id?: string;
  name?: string;
  
  email?: string | null;
  
  phone?: string | null;
  roleId?: string;
  
  branchId?: string | null;
  status?: string;
} | null;

export type MeBranchesItem = {
  id?: string;
  name?: string;
  city?: string;
  status?: string;
};

export type MeRolesItem = {
  id: string;
  name: string;
  isOwner?: boolean;
  grantable: boolean;
};

export type MeSettings = {
  currency: string;
  locale: string;
  taxRate: number;
  serviceChargeRate: number;
};

export interface Me {
  organizationId: string;
  
  clerkUserId?: string | null;
  
  staff?: MeStaff;
  
  branchId?: string | null;
  branches?: MeBranchesItem[];
  
  role?: string | null;
  
  roleId?: string | null;
  permissions: string[];
  isOwner: boolean;
  canGrantStaff?: boolean;
  operator?: boolean;
  branchLimit?: number;
  modules?: string[];
  roles?: MeRolesItem[];
  settings?: MeSettings;
}

export type StockTransferStatusInputStatus = typeof StockTransferStatusInputStatus[keyof typeof StockTransferStatusInputStatus];


export const StockTransferStatusInputStatus = {
  DRAFT: 'DRAFT',
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  IN_TRANSIT: 'IN_TRANSIT',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;

export interface StockTransferStatusInput {
  status: StockTransferStatusInputStatus;
}

export interface NotificationReadInput {
  read: boolean;
}

export interface StockCountApprovalInput {
  
  reason?: string | null;
}

export interface ProductInput {
  
  name: string;
  categoryId: string;
  category: string;
  baseUnit?: string;
  
  sku?: string | null;
  
  barcode?: string | null;
  
  description?: string | null;
  
  cost?: number;
  
  price: number;
  
  tax?: number;
  trackInventory?: boolean;
  accent?: string;
}

export interface ProductUnitInput {
  
  name: string;
  
  abbreviation: string;
  
  conversionFactor: number;
  isBaseUnit?: boolean;
  
  sellingPrice: number;
  
  cost?: number | null;
  wholeUnitsOnly?: boolean;
  sortOrder?: number;
}

export interface ProductBarcodeInput {
  
  barcode: string;
  unitId: string;
}


export type BarcodeLookupSellingUnit = {
  id?: string;
  name?: string;
  abbreviation?: string;
  conversionFactor?: number;
  sellingPrice?: number;
  wholeUnitsOnly?: boolean;
} | null;

export interface BarcodeLookup {
  productId: string;
  name: string;
  category: string;
  baseUnit: string;
  trackInventory: boolean;
  active: boolean;
  
  stock?: number | null;
  
  stockUnit?: string | null;
  
  sellingUnit?: BarcodeLookupSellingUnit;
}

export type FloorLayoutFloorsItemSectionsItem = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

export type FloorLayoutFloorsItem = {
  id: string;
  name: string;
  sortOrder: number;
  sections: FloorLayoutFloorsItemSectionsItem[];
};

export interface FloorLayout {
  branchId: string;
  floors: FloorLayoutFloorsItem[];
}

export interface FloorInput {
  
  name: string;
  sortOrder?: number;
  branchId?: string;
}

export interface FloorSectionInput {
  
  name: string;
  color?: string;
  sortOrder?: number;
}

export type TableInputStatus = typeof TableInputStatus[keyof typeof TableInputStatus];


export const TableInputStatus = {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  CLEANING: 'CLEANING',
} as const;

export interface TableInput {
  
  name?: string;
  
  section?: string;
  
  floorSectionId?: string | null;
  
  seats?: number;
  x?: number;
  y?: number;
  
  width?: number;
  
  height?: number;
  status?: TableInputStatus;
  branchId?: string;
  floorId?: string;
}

export interface Payment {
  id: string;
  organizationId: string;
  branchId: string;
  orderId: string;
  amount: number;
  method: string;
  
  reference?: string | null;
  status: string;
  
  cashierId?: string | null;
  paidAt: string;
  outstanding?: number;
  fullyPaid?: boolean;
}

export type PaymentInputMethod = typeof PaymentInputMethod[keyof typeof PaymentInputMethod];


export const PaymentInputMethod = {
  CASH: 'CASH',
  MPESA: 'MPESA',
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  OTHER: 'OTHER',
} as const;

export interface PaymentInput {
  orderId: string;
  
  amount: number;
  method: PaymentInputMethod;
  
  reference?: string | null;
  isFinal?: boolean;
}

export interface Refund {
  id: string;
  paymentId: string;
  amount: number;
  
  reason?: string | null;
  status: string;
  
  approvedById?: string | null;
  createdAt: string;
}

export type RefundInputStatus = typeof RefundInputStatus[keyof typeof RefundInputStatus];


export const RefundInputStatus = {
  PENDING: 'PENDING',
  SUCCESSFUL: 'SUCCESSFUL',
} as const;

export interface RefundInput {
  paymentId: string;
  
  amount: number;
  
  reason: string;
  status?: RefundInputStatus;
}

export type StockTransferItemsItem = {
  id?: string;
  productId?: string;
  quantity?: string;
  quantityInBaseUnit?: string;
};

export interface StockTransfer {
  id: string;
  organizationId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  status: string;
  
  notes?: string | null;
  
  approvedById?: string | null;
  createdAt: string;
  items?: StockTransferItemsItem[];
}

export type StockTransferInputItemsItem = {
  productId: string;
  
  quantity: number;
  
  unitId?: string | null;
};

export interface StockTransferInput {
  sourceBranchId: string;
  destinationBranchId: string;
  
  notes?: string | null;
  
  items: StockTransferInputItemsItem[];
}

export type StockCountItemsItem = {
  id?: string;
  productId?: string;
  expectedQuantity?: string;
  
  actualQuantity?: string | null;
  
  variance?: string | null;
};

export interface StockCount {
  id: string;
  organizationId: string;
  branchId: string;
  status: string;
  
  notes?: string | null;
  
  countedById?: string | null;
  
  approvedById?: string | null;
  createdAt: string;
  items?: StockCountItemsItem[];
}

export type StockCountInputItemsItem = {
  productId: string;
  actualQuantity: number;
};

export interface StockCountInput {
  
  branchId?: string | null;
  
  notes?: string | null;
  
  items: StockCountInputItemsItem[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  
  referenceId?: string | null;
  createdAt: string;
}

export type NotificationInputType = typeof NotificationInputType[keyof typeof NotificationInputType];


export const NotificationInputType = {
  ORDER_READY: 'ORDER_READY',
  RESERVATION: 'RESERVATION',
  LOW_STOCK: 'LOW_STOCK',
  INVENTORY_DISCREPANCY: 'INVENTORY_DISCREPANCY',
  APPROVAL_REQUEST: 'APPROVAL_REQUEST',
  STOCK_TRANSFER: 'STOCK_TRANSFER',
  EVENT_REMINDER: 'EVENT_REMINDER',
} as const;

export interface NotificationInput {
  type: NotificationInputType;
  title: string;
  message: string;
  staffId: string;
  
  branchId?: string | null;
  
  referenceId?: string | null;
}

export type SearchResultResultsItem = {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export interface SearchResult {
  results: SearchResultResultsItem[];
}

export type InventoryReportDiscrepanciesItem = {
  productId?: string;
  
  name?: string | null;
  variance?: number;
  
  unit?: string | null;
};

export interface InventoryReport {
  totalItems: number;
  stockValue: number;
  belowReorder: number;
  outOfStock: number;
  byMovement: MetricPoint[];
  discrepancies: InventoryReportDiscrepanciesItem[];
}

export interface StaffReportItem {
  
  staffId: string | null;
  name: string;
  orders: number;
  revenue: number;
  averageOrderValue: number;
}

export interface TableReportItem {
  id: string;
  name: string;
  section: string;
  seats: number;
  status: string;
  revenue: number;
  covers: number;
  averageStayMinutes: number;
}

export type PaymentReportByMethodItem = {
  label: string;
  value: number;
  count: number;
};

export interface PaymentReport {
  total: number;
  refunded: number;
  byMethod: PaymentReportByMethodItem[];
}

export interface EventReportItem {
  id: string;
  name: string;
  date: string;
  capacity: number;
  status: string;
  reservations: number;
  guests: number;
  revenue: number;
  utilisation: number;
}

export type HqReportBranchesItem = {
  id: string;
  name: string;
  city: string;
  status: string;
  revenue: number;
  orders: number;
  tables: number;
  inventoryAlerts: number;
};

export interface HqReport {
  totalRevenue: number;
  totalOrders: number;
  activeBranches: number;
  inventoryAlerts: number;
  upcomingEvents: number;
  activeStaff: number;
  branches: HqReportBranchesItem[];
}

export type GetProductsParams = {
category?: string;
search?: string;
};

export type GetTabsParams = {
status?: GetTabsStatus;
};

export type GetTabsStatus = typeof GetTabsStatus[keyof typeof GetTabsStatus];


export const GetTabsStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type GetOrdersParams = {
status?: GetOrdersStatus;
};

export type GetOrdersStatus = typeof GetOrdersStatus[keyof typeof GetOrdersStatus];


export const GetOrdersStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type CreateRealtimeTicket200 = {
  ticket: string;
  expiresInSeconds: number;
};

export type GetCustomersParams = {
search?: string;
};

export type GetSalesReportParams = {
dateFrom?: string;
dateTo?: string;
};

export type GetProductReportParams = {
dateFrom?: string;
dateTo?: string;
};

export type GetAuditLogsParams = {
entity?: string;
action?: string;
};

export type GetFloorsParams = {
branchId?: string;
};

export type GetFloorTablesParams = {
branchId?: string;
};

export type GetPaymentsParams = {
orderId?: string;
};

export type GetNotificationsParams = {
unread?: boolean;
limit?: number;
};

export type GetNotificationUnreadCount200 = {
  count: number;
};

export type GlobalSearchParams = {
q: string;
};

export type GetTicketsParams = {
station: GetTicketsStation;
includeClosed?: boolean;
};

export type GetTicketsStation = typeof GetTicketsStation[keyof typeof GetTicketsStation];


export const GetTicketsStation = {
  BAR: 'BAR',
  KITCHEN: 'KITCHEN',
} as const;

export type GetAdminAuditLogsParams = {
organizationId?: string;
action?: string;
limit?: number;
};

export type GetInventoryReportParams = {
branchId?: string;
};

export type GetStaffReportParams = {
branchId?: string;
};

export type GetTableReportParams = {
branchId?: string;
};

export type GetPaymentReportParams = {
branchId?: string;
};

export type GetEventReportParams = {
branchId?: string;
};
