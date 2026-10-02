# DUNDA — THE CLUB OPERATING SYSTEM

Build **Dunda**, a premium, production-ready Club Operating System for bars, nightclubs,
lounges, entertainment venues, and multi-branch club groups.

Dunda is **not a generic admin dashboard** and should not look like a generic SaaS template.

The central idea is:

> **One platform to run your club, from the floor to the back office.**

Dunda brings together POS, customer tabs, tables, pool tables, inventory, staff, payments,
reservations, events, analytics, and management into one connected system.

---

# 1. PRODUCT STRUCTURE

Dunda has two completely different levels:

## A. Dunda Platform

This is the SaaS platform owned by Dunda.

Platform Owner/Admin manages:

* Organizations
* Subscriptions
* Billing
* Platform users
* Feature access
* Platform analytics
* Support
* System monitoring
* Platform audit logs
* Global settings

## B. Organization / Club

Each paying organization gets its own isolated workspace.

A club manages:

* POS
* Tables
* Pool
* Orders
* Customer tabs
* Inventory
* Products
* Customers
* Staff
* Reservations
* Events
* Payments
* Expenses
* Reports
* Branches
* Settings

Strict multi-tenant isolation is required.

One organization must never access another organization's data.

---

# 2. TECHNOLOGY STACK

Use:

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* Lucide icons
* PostgreSQL
* Prisma ORM
* Clerk authentication
* Zod validation
* Recharts
* Framer Motion where useful
* npm
* API/service architecture
* WebSockets or an appropriate realtime solution

Use clean, modular, production-oriented architecture.

Do not put business logic inside UI components.

Financial calculations must happen server-side.

---

# 3. DESIGN DIRECTION

Dunda should feel like serious commercial software designed specifically for nightlife businesses.

Design language:

* Premium
* Dark
* Modern
* Fast
* Professional
* Operational
* High information density without being cluttered

Use:

* Near-black
* Charcoal
* Graphite
* White
* Muted gray
* Gold/amber accent
* Green for success
* Amber for warnings
* Red for critical actions

Avoid:

* Excessive glassmorphism
* Excessive gradients
* Neon everywhere
* Generic startup dashboards
* Generic CRM layouts
* Huge decorative hero sections
* Excessive rounded cards
* Unnecessary animations

The application should prioritize:

> **FAST > DECORATIVE**

It should feel excellent on desktop and tablet.

POS screens must be optimized for touch.

---

# 4. AUTHENTICATION

Use Clerk.

Support:

* Login
* Logout
* Organization selection
* Session management
* Role-based access
* Protected routes

Create separate access boundaries for:

```text
Dunda Platform Admin
        ↓
Dunda SaaS
        ↓
Club Organization
        ↓
Club Staff
```

A club user must never access `/admin`.

---

# 5. DUNDA PLATFORM ADMIN

Create a completely separate platform administration area.

Suggested route:

```text
/admin
```

Platform Owner should see:

## Overview

* Total organizations
* Active organizations
* Trial organizations
* Suspended organizations
* New organizations
* MRR
* Subscription revenue
* Active users
* Platform activity

## Organizations

Show:

* Organization name
* Owner
* Location
* Branches
* Users
* Subscription plan
* Subscription status
* Registration date
* Last activity

Actions:

* View organization
* Support access/impersonation
* Suspend
* Reactivate
* Change plan
* Extend trial
* Cancel subscription

## Subscriptions

* Plans
* Active subscriptions
* Trials
* Expired subscriptions
* Past-due subscriptions
* Upgrades
* Downgrades
* Cancellations
* Renewals

## Billing

* Subscription revenue
* Payments
* Failed payments
* Pending payments
* Refunds
* Invoices
* Payment references
* Revenue by plan
* Revenue by organization

## Platform Users

* All users
* Platform administrators
* Organization owners
* Staff
* Account status
* Last login

## Platform Analytics

* Organization growth
* User growth
* Revenue growth
* Churn
* Trial conversion
* Most-used modules
* Platform activity

## Feature Management

Allow the platform owner to enable/disable modules per organization.

Example:

```text
Singapore Club

POS              ON
Inventory        ON
Pool             ON
Reservations     ON
Events           OFF
AI Insights      OFF
```

## Support

* Support tickets
* Bug reports
* Feature requests
* Customer issues

## System Monitoring

* API health
* Database health
* Failed webhooks
* Failed payments
* System errors
* Background jobs

## Platform Audit Logs

Track:

* Admin actions
* Organization changes
* Subscription changes
* Suspensions
* Feature changes
* Billing actions

---

# 6. CLUB ORGANIZATION ROLES

Support:

* OWNER
* GENERAL_MANAGER
* MANAGER
* CASHIER
* BARTENDER
* WAITER
* POOL_ATTENDANT
* INVENTORY_MANAGER

Permissions must be granular.

Example:

```text
Cashier:
Create order        ✓
Take payment        ✓
Refund              ✗
Large discount      ✗

Manager:
Create order        ✓
Take payment        ✓
Approve discount    ✓
Refund              ✓

Owner:
Everything          ✓
```

Sensitive actions require authorization.

---

# 7. MAIN CLUB ROUTES

Create:

```text
/dashboard
/pos
/floor
/pool
/orders
/inventory
/products
/customers
/reservations
/staff
/payments
/expenses
/reports
/settings
/billing
```

---

# 8. CLUB DASHBOARD

The dashboard should be a live operational command center.

Display:

* Today's revenue
* Orders
* Active tabs
* Bar revenue
* Food revenue
* Pool revenue
* Outstanding payments
* Occupied tables
* Active pool sessions
* Reservations
* Low-stock products
* Recent orders
* Recent payments
* Staff currently on shift

Example:

```text
TODAY

Revenue          KES 184,500
Orders                 327
Active Tabs             28
Pool Revenue       KES 18,400
Outstanding         KES 7,200
Staff On Shift           14
```

Then show live operations.

---

# 9. POS

Create a fast tablet-friendly POS.

Categories:

* Beer
* Spirits
* Wine
* Cocktails
* Soft Drinks
* Water
* Food
* Snacks
* Combos
* Other

Features:

* Product grid
* Search
* Category filters
* Barcode scanning
* Customer selection
* Table selection
* Tab selection
* Add items
* Remove items
* Quantity
* Notes
* Discounts
* Hold order
* Send order
* Checkout
* Split bill
* Merge bill
* Transfer tab

POS must support:

* Fast product selection
* Large touch targets
* Minimal clicks
* Keyboard shortcuts
* Barcode input
* Real-time order status

---

# 10. CUSTOMER TABS

Tabs are central to Dunda.

A tab should support:

* Tab number
* Customer
* Table
* Pool table
* Staff
* Start time
* Items
* Pool charges
* Discounts
* Payments
* Outstanding balance
* Total

Actions:

* Open tab
* Add items
* Attach table
* Attach pool
* Transfer
* Add discount
* Split
* Merge
* Add payment
* Checkout
* Close

---

# 11. FLOOR MANAGEMENT

Create visual floor management.

Sections:

* Main Floor
* VIP
* Lounge
* Pool Area
* Outdoor

Table statuses:

* Available
* Occupied
* Reserved
* Payment Pending

Clicking a table should show:

* Customer
* Waiter
* Current tab
* Orders
* Total
* Reservation
* Pool session

Actions:

* Open
* Reserve
* Transfer
* Merge
* Split
* Close

---

# 12. POOL MANAGEMENT

Support commercial pool tables.

Example:

```text
Pool 1
Pool 2
Pool 3
Pool 4
Pool 5
```

Statuses:

* Available
* Occupied
* Reserved
* Paused
* Maintenance

Each pool table should show:

* Current customer
* Current tab
* Start time
* Duration
* Rate
* Current charge
* Status

Actions:

* Start session
* Pause
* Resume
* End session
* Attach to tab
* Reserve

---

# 13. POOL BILLING

Pool pricing must be configurable.

Support:

* Hourly rates
* Half-hour rates
* Minimum duration
* Rounding rules
* Peak rates
* Off-peak rates

Never hardcode pool prices.

Calculate charges server-side.

Example:

```text
Pool session:
Start: 20:00
End: 21:30
Rate: KES 300/hour

Charge:
KES 450
```

Store:

* Start time
* End time
* Actual duration
* Billable duration
* Rate
* Charge
* Staff member
* Pool table
* Customer
* Tab

---

# 14. COMBINED BAR + POOL BILL

This is one of Dunda's most important features.

A customer can have:

```text
4 Beers             KES 800
2 Cocktails         KES 1,000
Food                KES 450
Pool 1h 30m         KES 450
----------------------------
TOTAL               KES 2,700
```

Internally categorize revenue:

```text
BAR
FOOD
POOL
```

But the customer receives:

> ONE TAB
> ONE BILL
> ONE RECEIPT

---

# 15. ORDERS

Order statuses:

```text
NEW
CONFIRMED
PREPARING
READY
SERVED
COMPLETED
CANCELLED
```

Support:

* Order number
* Customer
* Table
* Staff
* Items
* Notes
* Status
* Timestamp

---

# 16. BAR/KITCHEN DISPLAY

Create operational displays.

Example:

```text
NEW

Order #1042
Table 7

2 × Beer
1 × Burger
1 × Cocktail

[ACCEPT]
```

Realtime status changes should be reflected across the relevant screens.

---

# 17. INVENTORY

Inventory should automatically connect to sales.

Track:

* Product
* SKU
* Barcode
* Category
* Unit
* Opening stock
* Received stock
* Sold stock
* Wasted stock
* Adjusted stock
* Current stock
* Minimum stock
* Cost
* Selling price
* Variance

Movement types:

* RECEIVED
* SOLD
* WASTE
* ADJUSTMENT
* RETURN
* TRANSFER

Dashboard:

* Current stock
* Low stock
* Out of stock
* Inventory value
* Variance

---

# 18. UNITS

Support:

* Piece
* Bottle
* Can
* Pack
* Box
* Glass
* Shot
* Portion
* Kilogram
* Liter
* Milliliter

Support configurable conversions.

Examples:

```text
1 Box = 20 Pieces
1 Bottle = configurable glasses
1 Bottle = configurable shots
```

Do not hardcode conversions.

---

# 19. BARCODE SYSTEM

Support:

* USB barcode scanners
* Bluetooth scanners
* Camera scanning

Barcode should identify:

* Product
* Selling unit
* Price

Completed sales automatically deduct inventory.

Manual search must remain available.

---

# 20. RECIPES

Support recipes for products that consume ingredients.

Example:

```text
Cocktail
 ├── Spirit
 ├── Mixer
 ├── Syrup
 └── Garnish
```

When the cocktail is sold, configured recipe ingredients should be deducted from inventory.

Recipe quantities must be configurable.

---

# 21. PRODUCTS

Product fields:

* Name
* SKU
* Barcode
* Category
* Description
* Image
* Cost price
* Selling price
* Inventory unit
* Selling unit
* Minimum stock
* Tax
* Availability
* Recipe

---

# 22. STAFF

Staff management:

* Staff profile
* Role
* Permissions
* Branch
* Status
* Sales
* Orders
* Discounts
* Voids
* Refunds

---

# 23. SHIFTS

Support:

* Clock in
* Clock out
* Opening cash
* Closing cash
* Expected cash
* Actual cash
* Variance

Managers can review:

* Staff on shift
* Shift duration
* Sales
* Cash variance

---

# 24. CUSTOMERS

Customer profile:

* Name
* Phone
* Email
* Visit count
* Total spend
* Last visit
* Reservations
* Orders
* Tabs

---

# 25. RESERVATIONS

Support:

* Normal tables
* Pool tables

Fields:

* Customer
* Phone
* Date
* Start time
* End time
* Table
* Guests
* Notes
* Status

Statuses:

```text
PENDING
CONFIRMED
ACTIVE
COMPLETED
CANCELLED
NO_SHOW
```

Prevent overlapping reservations.

---

# 26. EVENTS

Create event management for clubs.

Support:

* Event name
* Date
* Start/end time
* Description
* Capacity
* Ticket price
* Status
* Guest list
* Check-in
* Event revenue

---

# 27. PAYMENTS

There are TWO completely separate payment systems.

## A. Dunda Subscription Billing

Clubs pay Dunda for their SaaS subscription.

Use **Pesapal** as the initial payment provider.

First version:

> **Manual renewal**

Do not implement automatic recurring charges initially.

Flow:

```text
Club Owner
↓
Select Plan
↓
Renew Subscription
↓
Create Pesapal Payment
↓
Complete Payment
↓
Server verifies payment
↓
Subscription activated/extended
↓
Invoice generated
```

Support:

* Monthly plan
* Annual plan
* Trial
* Renewal
* Upgrade
* Downgrade
* Cancellation
* Failed payment
* Pending payment
* Invoice
* Payment history

Subscription statuses:

```text
TRIAL
ACTIVE
PAST_DUE
PAYMENT_PENDING
PAYMENT_FAILED
CANCELLED
EXPIRED
SUSPENDED
```

Payment statuses:

```text
INITIATED
PENDING
COMPLETED
FAILED
CANCELLED
REFUNDED
```

Never activate a subscription based solely on the frontend.

Verify payment server-side.

## B. CLUB CUSTOMER PAYMENTS

This is separate from Dunda subscription billing.

Customers pay clubs through the POS.

Support:

* Cash
* M-Pesa
* Card
* Bank
* Other electronic payment

Use Pesapal initially for electronic payments.

Design the architecture so direct Safaricom Daraja can be added later.

Payment architecture:

```text
PaymentService
├── PesapalProvider
└── DarajaProvider (future)
```

---

# 28. SPLIT BILLS

Support:

* Full payment
* Partial payment
* Multiple customers
* Multiple payment methods

Example:

```text
Total: KES 4,000

Customer A
M-Pesa
KES 1,500

Customer B
Cash
KES 1,000

Customer C
Card
KES 1,500

Status: PAID
```

Every payment must remain individually traceable.

Do not allow the total paid amount to exceed the outstanding balance unless an authorized
overpayment/refund flow exists.

---

# 29. PAYMENT SECURITY

All financial calculations must happen server-side.

Never trust:

* Frontend payment amount
* Frontend payment status
* Frontend subscription status
* Frontend transaction reference

Use:

* Server-side verification
* Idempotency
* Secure credentials
* Provider references
* Payment state machine
* Audit logs
* Transaction records
* Duplicate callback protection

Pesapal credentials must never be exposed to the browser.

Use sandbox credentials during development.

---

# 30. PAYMENT DATABASE

Create appropriate models for:

* Payment
* PaymentAttempt
* Refund
* Subscription
* SubscriptionPlan
* Invoice
* PaymentProviderTransaction

Store:

* Organization
* Amount
* Currency
* Provider
* Provider transaction ID
* Reference
* Status
* Payment method
* Timestamp
* User
* Related order/tab/subscription

Financial records should not simply be deleted.

---

# 31. RECEIPTS

Club receipts:

```text
Dunda-powered Club

Receipt #
Date / Time
Staff
Table
Customer
Tab

Items
Pool charges
Discount
Tax/service charge
Total

Payment method
Payment reference
```

Subscription invoices:

```text
Dunda
Organization
Invoice number
Plan
Billing period
Amount
Tax if applicable
Payment status
Transaction reference
Date
```

---

# 32. EXPENSES

Track:

* Category
* Description
* Amount
* Date
* Payment method
* Staff
* Reference

Categories:

* Supplies
* Utilities
* Maintenance
* Staff
* Rent
* Marketing
* Other

Reports should support:

```text
Revenue
-
Expenses
=
Net
```

---

# 33. REPORTS

Support:

* Daily
* Weekly
* Monthly
* Custom date range

Revenue:

* Total
* Bar
* Food
* Pool

Payment reports:

* Cash
* M-Pesa
* Card
* Bank
* Other

Product reports:

* Best sellers
* Slow movers
* Revenue
* Quantity sold

Staff reports:

* Sales
* Orders
* Discounts
* Voids
* Refunds

Pool reports:

* Utilization
* Hours used
* Revenue
* Revenue per table
* Sessions
* Average duration
* Peak hours
* Reservations

Inventory reports:

* Current stock
* Inventory value
* Wastage
* Adjustments
* Variance

---

# 34. POOL ANALYTICS

Show:

* Revenue by pool table
* Hours used
* Utilization
* Sessions
* Average session duration
* Peak hours
* Revenue per table
* Reservation performance

---

# 35. AUDIT LOG

Track sensitive actions:

* Orders
* Edits
* Discounts
* Voids
* Refunds
* Pool start/end
* Stock adjustments
* Payments
* Logins
* Price changes
* Staff changes

Store:

* User
* Action
* Entity
* Timestamp
* Previous value
* New value

Financial records should never silently disappear.

---

# 36. GLOBAL SEARCH

Implement:

```text
CMD/CTRL + K
```

Search:

* Products
* Orders
* Customers
* Tabs
* Pool sessions
* Reservations
* Receipts
* Staff

---

# 37. NOTIFICATIONS

Support notifications for:

* Low stock
* Reservation approaching
* Pool reservation
* Payment failure
* Large discount
* Refund
* Stock variance
* Shift closing
* Subscription expiry

---

# 38. REALTIME

Use realtime updates for:

```text
Waiter → Bar
Waiter → Kitchen
Pool start → Floor
Pool end → Tab
Payment → Dashboard
Inventory → Stock
Reservation → Floor
```

Changes should appear without requiring manual page refresh where appropriate.

---

# 39. DATABASE MODELS

Create a clean Prisma schema containing appropriate relationships for:

```text
Organization
Branch

User
Role
Permission
OrganizationMember
Staff
StaffShift

Product
Category
ProductUnit
ProductBarcode
UnitConversion
Recipe
RecipeIngredient

InventoryItem
StockMovement
StockCount
StockCountItem
StockTransfer
StockTransferItem
Supplier

Customer
CustomerTab

Floor
FloorSection
Table
PoolTable

Order
OrderItem
PoolSession

Reservation

Payment
PaymentAttempt
Refund
Receipt

Event
EventTicket
GuestList

Expense

Notification
AuditLog

Subscription
SubscriptionPlan
Invoice
PaymentProviderTransaction

Settings
```

Use proper foreign keys, indexes, constraints and organization isolation.

---

# 40. CORE BUSINESS RULES

Implement these rules:

1. Completed sales deduct inventory.
2. Voided sales reverse inventory where applicable.
3. Pool charges use actual session duration.
4. Pool sessions can attach to customer tabs.
5. Closing a tab requires payment or an authorized outstanding-balance flow.
6. Reservations cannot overlap.
7. Stock adjustments create stock movements.
8. Reports derive from transaction data.
9. Financial calculations happen server-side.
10. Sensitive actions require appropriate permissions.
11. Payment callbacks must be idempotent.
12. Organization data must remain isolated.
13. Subscription payments must remain separate from club customer payments.
14. Prices and pool rates must never be hardcoded.
15. Financial records must remain auditable.

---

# 41. RESPONSIVE DESIGN

Desktop:

* Full management interface
* Reports
* Inventory
* Staff
* Administration

Tablet:

* POS
* Floor management
* Pool management

Mobile:

* Staff-friendly operations
* Orders
* Pool sessions
* Notifications
* Quick actions

---

# 42. LOGIN

Create a premium Dunda login experience.

Dark interface.

Minimal.

Professional.

No unnecessary marketing elements.

---

# 43. DEMO DATA

Create realistic demo data for development.

Organization:

```text
Singapore Club
```

Branches:

```text
Main Branch
```

Pool tables:

```text
Pool 1
Pool 2
Pool 3
Pool 4
Pool 5
```

Floor sections:

```text
Main Floor
VIP
Lounge
Pool Area
Outdoor
```

Include realistic:

* Products
* Staff
* Customers
* Orders
* Tabs
* Pool sessions
* Reservations
* Inventory
* Payments
* Expenses

Do not use fake-looking lorem ipsum content.

---

# 44. IMPORTANT UX FLOW

The main experience should be:

```text
Customer arrives
        ↓
Table / Pool
        ↓
Open customer tab
        ↓
Start pool session if required
        ↓
Order drinks / food
        ↓
Orders sent to bar/kitchen
        ↓
Customer continues ordering
        ↓
Pool duration calculated
        ↓
Pool charge added to tab
        ↓
One combined bill
        ↓
Payment
        ↓
Receipt
        ↓
Tab closed
        ↓
Pool/table becomes available
        ↓
Inventory updated
        ↓
Reports updated
        ↓
Audit log updated
```

This flow is the heart of Dunda.

---

# 45. PLATFORM OWNER REVENUE MODEL

Dunda is a SaaS product.

Primary monetization:

* Monthly subscriptions
* Annual subscriptions
* Per-branch pricing
* Premium modules
* Additional users
* Onboarding/setup fees
* Enterprise plans
* Premium support
* Optional hardware/POS packages

Create configurable subscription plans.

Do not hardcode pricing.

---

# 46. INITIAL SUBSCRIPTION MODEL

Support plans such as:

```text
STARTER
PROFESSIONAL
BUSINESS
ENTERPRISE
```

Each plan can control:

* Branch limit
* User limit
* POS access
* Inventory
* Pool
* Events
* Reservations
* Analytics
* Advanced reports
* API access
* Support level

The platform owner can change feature availability per plan.

---

# 47. ERROR STATES

Every important page must have:

* Loading state
* Empty state
* Error state
* Success state
* Confirmation state

Use clear messages.

Do not leave blank screens.

---

# 48. CODE QUALITY

Use:

* Reusable components
* Clean service architecture
* Server-side validation
* Zod schemas
* Prisma
* Proper API boundaries
* Error handling
* Secure authorization
* Type safety
* Reusable hooks
* Proper loading states
* Proper empty states

Avoid:

* Giant components
* Duplicate logic
* Hardcoded financial calculations
* Hardcoded subscription prices
* Hardcoded pool rates
* Fake APIs
* Frontend-only security
* Mock data being presented as real production functionality

---

# 49. FINAL PRODUCT STANDARD

The finished application should feel like a serious commercial product that a real nightclub could
operate from every day.

The core experience is:

> **Customer arrives → table/pool → session → drinks/food → one tab → one bill → payment →
> receipt → inventory/report updates.**

At the same time, Dunda's platform owner should have complete visibility into:

> **Organizations → subscriptions → billing → users → platform analytics → feature access →
> support → system health.**

Build the system as a real multi-tenant SaaS product, not as a static dashboard mockup.

Prioritize working architecture, correct data relationships, secure authorization, payment
integrity, responsive UX, and the operational flow over decorative UI.

---
---

# CURRENT STATE OF THE REPOSITORY

Written 2026-10-01. This is the honest picture of what exists and what does not.

## Status: frontend shell only. The database layer was deleted and must be rebuilt.

## What exists on disk

| Path | State | Notes |
| --- | --- | --- |
| `app/` | Partial | `layout.tsx`, `page.tsx`, `globals.css`, `dunda-app.tsx`. Not the real club app. |
| `admin/` | Deleted from disk | `overview.tsx`, `clients.tsx`, `plans.tsx`, `billing.tsx`, `audit-trail.tsx`, `platform-staff.tsx`, `client-detail.tsx`, `new-client.tsx`. Static mock components, committed at `53c3656`. They vanished from the working tree during an npm install and were **not** deleted deliberately. Recover with `git checkout -- admin/`. |
| `pages/` | Deleted from disk | `pos.tsx`, `products.tsx`, `hq.tsx`, `floor-designer.tsx`, `staff-manager.tsx`, `service-board.tsx`. Same story: mock screens that broke the build ("pages without a React Component as default export"). Recover with `git checkout -- pages/`. Decide before restoring — they are mock UI and conflict with the no-mock rule. |
| `components/ui/` | Good | Full shadcn/ui set. Keep. |
| `lib/` | Partial | `utils.ts`, `errors.ts`, `money.tsx`, plus a generated `api-client-react` with no live server behind it. |
| `hooks/` | Partial | `use-api-auth.ts`, `use-session-guard.ts`, `use-live-refresh.ts`. Written against an API server that no longer exists. |
| `prisma/` | **Missing** | To be created. This is the immediate next task. |

## What was deleted, and why it matters

Commit `53c3656` ("huh", 2026-10-01) removed 104,652 lines including the entire backend:

* `prisma/schema.prisma` and `prisma/migrations/` — an earlier Prisma schema, 25 models
* `lib/db/` — a Drizzle ORM schema (17 files) covering organization, auth, permissions,
  products, inventory, tables, orders, customers, events, payments, plans, billing, system
* `artifacts/api-server/` — Express API, ~90 route and lib files
* `scripts/src/seed.ts`, `seedPlans.ts`, `syncRoles.ts` — the seeders
* `tests/` — vitest suite for money, permissions, routing

Commit `9499dde` was the last commit with a working backend. If any of that logic is wanted,
it can be recovered with `git show 9499dde:<path>`.

## The database is real and reachable

`DATABASE_URL` points at a live Neon PostgreSQL 18.6 instance. It contained 51 tables under
the `dunda_` prefix, created by the deleted Drizzle layer.

Every one of those tables is **empty**. `pg_stat_user_tables.n_live_tup` reported stale
figures (11 roles, 5 products, 2 organizations and so on) that looked like seeded demo data;
exact `count(*)` against every table returns zero. Nothing was lost when the schema was
migrated, because there was nothing to lose.

Original 51 tables:

```text
dunda_activity               dunda_payments                dunda_stock_transfers
dunda_audit_logs             dunda_permissions             dunda_subscriptions
dunda_billing_payments       dunda_plans                   dunda_suppliers
dunda_branch_members         dunda_product_barcodes        dunda_tab_item_units
dunda_branches               dunda_product_branch_availability
dunda_categories             dunda_product_units           dunda_tab_items
dunda_customers              dunda_products                dunda_tables
dunda_document_counters      dunda_refunds                 dunda_tabs
dunda_event_reservations     dunda_reservations            dunda_vip_packages
dunda_events                 dunda_role_permissions
dunda_floor_sections         dunda_roles                   dunda_staff
dunda_floors                 dunda_setup_token_attempts     dunda_staff_shifts
dunda_inventory_alerts       dunda_setup_tokens            dunda_stock_count_items
dunda_inventory_items        dunda_orders                  dunda_stock_counts
dunda_invoices               dunda_order_item_units        dunda_stock_movements
dunda_notifications          dunda_order_items             dunda_stock_transfer_items
dunda_order_ticket_items     dunda_organization_members
dunda_order_tickets          dunda_organizations
```

A local PostgreSQL 18 also runs on this machine but has no role for the current user
(`role "jlee" does not exist`), so Neon is the working target.

## Schema work completed

`prisma/schema.prisma` now maps all 51 original tables plus 18 new ones, 69 tables total.
Two migrations exist and both are applied:

```text
20261001170000_baseline                  the 51 pre-existing tables, marked applied
20261001180000_pool_expenses_recipes     additive: 18 new tables, new columns, indexes
```

New tables added:

```text
dunda_pool_tables                    dunda_recipes
dunda_pool_rate_rules                dunda_recipe_ingredients
dunda_pool_sessions                  dunda_unit_conversions
dunda_expenses                       dunda_receipts
dunda_event_tickets                  dunda_payment_attempts
dunda_event_guest_list               dunda_payment_provider_transactions
dunda_organization_settings          dunda_platform_users
dunda_organization_features          dunda_support_tickets
                                     dunda_platform_audit_logs
```

Notable column additions: `dunda_reservations.starts_at` / `ends_at` (real timestamps for
overlap checks, alongside the existing free-text date/time columns), `dunda_payments.tab_id`
and `idempotency_key` (payments can now settle a tab, not just an order, and replaying the
same request cannot double-charge), `dunda_tabs.bar_total` / `food_total` / `pool_total` /
`outstanding` (the split bill from section 14), `dunda_orders.tab_id` and `revenue_category`,
`dunda_products.minimum_stock` / `inventory_unit_id` / `selling_unit_id`,
`dunda_organizations.status` and suspension fields.

## Gaps between the live database and the spec

All resolved. See "Schema work completed" above. What each spec area got:

| Spec area | Storage |
| --- | --- |
| Pool tables, sessions, configurable rates | `dunda_pool_tables`, `dunda_pool_sessions`, `dunda_pool_rate_rules` |
| Combined bar + pool bill | `dunda_tabs.bar_total` / `food_total` / `pool_total`, `dunda_pool_sessions.tab_id` |
| Expenses and net reports | `dunda_expenses` |
| Unit conversions | `dunda_unit_conversions` (configurable, not hardcoded) |
| Recipes and ingredient deduction | `dunda_recipes`, `dunda_recipe_ingredients` |
| Payment attempts and provider calls | `dunda_payment_attempts`, `dunda_payment_provider_transactions` |
| Receipts | `dunda_receipts` |
| Event tickets and guest list | `dunda_event_tickets`, `dunda_event_guest_list` |
| Reservation overlap prevention | `starts_at` / `ends_at` timestamptz columns |
| Per-organization module toggles | `dunda_organization_features`, `dunda_organization_settings` |
| Platform admin, support, platform audit | `dunda_platform_users`, `dunda_support_tickets`, `dunda_platform_audit_logs` |

Still to build in code: every service layer. No rules are implemented yet — the schema stores
the facts, the logic that enforces section 40's fifteen business rules does not exist yet.

## Immediate plan

Done: steps 1 through 4.

1. ~~`prisma/schema.prisma` mapping every existing `dunda_` table~~ done
2. ~~Add the missing tables~~ done
3. ~~`prisma migrate dev` baseline + additive migration~~ done, applied to Neon
4. ~~`lib/db/client.ts` Prisma singleton~~ **next**
5. Server-side services on real queries only: tenancy scoping, permissions, pool billing
   calculations, inventory deduction, payment state machine.

Nothing will be mocked. If a table does not exist yet, it gets created.

## Environment

```bash
npm install
npx prisma migrate dev
npm run dev
```

Dependencies already installed include Next.js 16, React 19, Tailwind 4, Clerk, Zod, Recharts,
Framer Motion, shadcn/ui, Lucide, and now Prisma 6.

Note: `.npmrc` sets `legacy-peer-deps=true` because `@base-ui/react` declares an optional peer
on `date-fns@^4` while the project pins `^3`. pnpm ignored this; npm does not.