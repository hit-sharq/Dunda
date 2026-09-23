
# DUNDA — THE CLUB OPERATING SYSTEM

Build a production-quality, multi-tenant SaaS platform called **Dunda**.

## BRAND

**Dunda**

**The Club Operating System**

Tagline:

**Run the night. Run the business.**

Dunda is a complete operating platform for:

* Nightclubs
* Lounges
* Bars
* Entertainment venues
* Hospitality businesses
* Multi-branch club groups

Dunda is NOT just a POS.

It combines:

* POS
* Sales
* Payments
* Tables
* Floor management
* Bar operations
* Kitchen operations
* Inventory
* Product management
* Barcode scanning
* Unit/portion selling
* Customers
* Reservations
* VIP management
* Events
* Staff
* Shifts
* Branches
* Multi-branch HQ
* Reports
* Analytics
* Notifications
* Audit logs
* Mobile staff operations

---

# 1. CRITICAL ARCHITECTURE

This must be ONE platform with TWO applications inside ONE MONOREPO.

Applications:

1. **Dunda Web**
2. **Dunda Mobile**

They must share:

* One backend
* One PostgreSQL database
* One Prisma schema
* One authentication system
* One organization system
* One branch system
* One permission system
* Shared TypeScript types
* Shared validation
* Shared business logic
* Shared API

DO NOT create two independent products.

DO NOT create a separate mobile database.

DO NOT create a separate mobile backend.

DO NOT let the mobile application connect directly to PostgreSQL.

Architecture:

```text
                         DUNDA
                           │
             ┌─────────────┴─────────────┐
             │                           │
        DUNDA WEB                   DUNDA MOBILE
         Next.js                    Expo / React Native
             │                           │
             └─────────────┬─────────────┘
                           │
                      SHARED API
                           │
                         Prisma
                           │
                      PostgreSQL
```

---

# 2. MONOREPO

Use:

* pnpm
* Turborepo
* TypeScript

Structure:

```text
dunda/
│
├── apps/
│   ├── web/
│   └── mobile/
│
├── packages/
│   ├── db/
│   ├── api/
│   ├── types/
│   ├── validation/
│   ├── config/
│   └── ui/
│
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Web

Use:

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* Lucide icons

## Mobile

Use:

* Expo
* React Native
* TypeScript
* Expo Router

## Database

Use:

* PostgreSQL
* Prisma

## Authentication

Use:

* Clerk

## Validation

Use:

* Zod

---

# 3. MULTI-TENANT ARCHITECTURE

Dunda must be multi-tenant from day one.

Hierarchy:

```text
Organization
│
├── Branch
│   ├── Floors
│   ├── Sections
│   ├── Tables
│   ├── Products
│   ├── Inventory
│   ├── Orders
│   ├── Staff
│   └── Events
│
├── Branch
│
└── Branch
```

Example:

```text
Skyline Entertainment Group

├── Nairobi
├── Mombasa
└── Kisumu
```

Organization owners can manage multiple branches.

Branch managers should only manage their authorized branch.

Staff must only access data permitted by organization, branch and role.

Never rely only on frontend restrictions.

Authorization must be enforced server-side.

---

# 4. USER ROLES

Support:

### Organization Owner

Full organization access.

### Administrator

System administration.

### General Manager

Operational management.

### Branch Manager

Manage assigned branch.

### Cashier

POS and payment operations.

### Waiter

Tables and orders.

### Bartender

Bar operations.

### Kitchen Staff

Kitchen operations.

### Inventory Manager

Stock and inventory.

### Event Manager

Events and reservations.

### Floor Staff

Floor operations.

Permissions must be granular.

Examples:

* View POS
* Create order
* Modify order
* Apply discount
* Void order
* Refund payment
* Close order
* View inventory
* Adjust inventory
* Approve transfer
* Manage staff
* Manage products
* Manage prices
* Manage events
* Manage reservations
* View reports

Sensitive actions require appropriate permissions.

---

# 5. PUBLIC WEBSITE

Create a premium public landing page for Dunda.

Hero:

# Dunda

## The Club Operating System

**Run the night. Run the business.**

Buttons:

**Get Started**

**Book a Demo**

Sections:

### The problem

Clubs often manage sales, inventory, staff, tables and events across disconnected systems.

### The solution

Dunda brings the operation together.

### Core modules

POS
Floor
Inventory
Events
VIP
Staff
Analytics
Multi-branch
Mobile

### How Dunda works

1. Set up your club
2. Add your products and floor
3. Add your team
4. Start selling
5. Monitor operations

### Multi-branch

Manage your entire entertainment group from one place.

### Mobile

Run operations from anywhere on the floor.

### CTA

**Run your club with Dunda.**

---

# 6. WEB APPLICATION

Create the full Dunda management application.

Main navigation:

```text
Overview
POS
Floor
Orders
Bar / Kitchen
Inventory
Products
Customers
Reservations
VIP
Events
Staff
Reports
Branches
Settings
```

Navigation must be permission-aware.

---

# 7. WEB DASHBOARD

Create a premium operational dashboard.

Header:

* Organization
* Current branch
* Branch switcher
* Global search
* Notifications
* User profile

Dashboard metrics:

* Today's Revenue
* Orders
* Average Order Value
* Active Tables
* Occupied Tables
* Pending Orders
* Low Stock
* Upcoming Events

Charts:

### Revenue

Daily / weekly / monthly.

### Sales by category

Beer
Spirits
Cocktails
Food
Wine
Soft drinks
Other

### Payment breakdown

Cash
M-Pesa
Card
Other configured methods

### Top products

Show sales volume and revenue.

### Live floor

Show current table status.

### Recent orders

Order number
Table
Staff
Amount
Status

### Upcoming events

Event
Date
Reservations
Status

---

# 8. POS

The POS is one of the most important parts of Dunda.

It must be extremely fast.

Design it for:

* Desktop
* Laptop
* Touchscreen
* Tablet
* Barcode scanners

Layout:

```text
------------------------------------------------
| Categories | Products       | Current Order |
|            |                |               |
| Beer       | Product        | Tusker x2     |
| Spirits    | Product        | Cocktail x1   |
| Cocktails  | Product        | Cigar x3      |
| Wine       | Product        |               |
| Food       | Product        | Total         |
------------------------------------------------
```

Features:

* Search products
* Category filtering
* Barcode scanning
* Product selection
* Quantity
* Unit selection
* Notes
* Discounts
* Customer
* Table
* Open orders
* Hold order
* Resume order
* Split bill
* Merge orders
* Transfer table
* Void
* Refund
* Print receipt
* Digital receipt

---

# 9. BARCODE SCANNING

Products can have:

* Barcode
* SKU
* Product name

Support:

### Web POS

* USB barcode scanners
* Bluetooth barcode scanners
* Keyboard-emulation scanners

A barcode scanner should behave like a fast POS input device.

Scanning:

```text
SCAN
↓
Find product
↓
Find configured selling unit
↓
Add to order
```

### Mobile

Use the phone camera as a barcode scanner.

Mobile scanning:

```text
Camera
↓
Barcode
↓
Product
↓
Selling unit
↓
Order
```

If a barcode is unknown:

Show:

**Product not found**

Authorized users can register the barcode.

Prevent duplicate barcode assignment.

---

# 10. PRODUCT MANAGEMENT

Product fields:

* Name
* SKU
* Barcode
* Category
* Description
* Image
* Cost
* Selling price
* Tax
* Inventory tracking
* Active/inactive
* Branch availability
* Base inventory unit
* Selling units

Products must support multiple selling units.

---

# 11. UNIT & PORTION MANAGEMENT

This is a critical Dunda feature.

Do NOT assume:

**1 product = 1 sale**

Products can be sold as:

* Piece
* Pack
* Box
* Bottle
* Glass
* Shot
* Portion
* Plate
* Serving
* Session
* Custom configured unit

Products must support:

* Base inventory unit
* Selling unit
* Unit conversion
* Selling price
* Cost per unit
* Inventory deduction

---

# 12. PRODUCT EXAMPLES

## Beer

```text
Product: Tusker

Inventory Unit:
Bottle

Selling Unit:
Bottle

Price:
KES 250
```

---

## Cigar

```text
Product:
Cigar

Inventory Unit:
Piece

Selling Unit:
Piece

Price:
KES 500
```

POS should allow:

```text
Cigar x1
Cigar x2
Cigar x3
```

Inventory decreases by the exact number of pieces sold.

---

# 13. PACKAGED PRODUCTS

Products can be received in larger packaging but sold individually.

Example:

```text
Cigar Box

1 box = 20 cigars
```

Inventory:

```text
5 boxes
=
100 pieces
```

POS:

```text
Sell 3 cigars
```

Inventory becomes:

```text
97 pieces
```

The system should internally maintain a reliable base-unit quantity.

---

# 14. MORE UNIT EXAMPLES

Support:

```text
Beer:
1 case = 24 bottles

Cigar:
1 box = 20 pieces

Cigarette:
1 pack = 20 pieces

Soft drink:
1 crate = 24 bottles

Wine:
1 bottle = 750ml

Whisky:
1 bottle = 750ml
```

Where appropriate, allow selling:

```text
Whisky
Bottle
Glass
Shot
```

Example:

```text
Bottle    KES 8,000
Glass     KES 1,000
Shot      KES 500
```

The inventory deduction must correspond to the configured unit conversion.

---

# 15. UNIT CONFIGURATION

Authorized users can configure:

```text
Product:
Whisky

Base Unit:
ml

Package:
Bottle

Bottle Size:
750ml

Selling Units:

Shot:
30ml

Glass:
60ml

Bottle:
750ml
```

When one shot is sold:

```text
Inventory deduction:
30ml
```

When one glass is sold:

```text
Inventory deduction:
60ml
```

When one bottle is sold:

```text
Inventory deduction:
750ml
```

Use safe decimal handling for quantities.

---

# 16. POS QUANTITY

Support:

* Quantity 1
* Quantity 2
* Quantity 3
* Custom quantity
* Unit selection
* Portion selection
* Whole-unit products
* Fractional quantities where configured

Products configured as whole units must not allow invalid fractional quantities.

---

# 17. POS PRODUCT OPTIONS

When a product has multiple selling units:

```text
WHISKY

Select:

[ SHOT ]
KES 500

[ GLASS ]
KES 1,000

[ BOTTLE ]
KES 8,000
```

The order item must store:

* Product
* Selling unit
* Quantity
* Unit price
* Total
* Inventory deduction

---

# 18. ORDER MANAGEMENT

Order statuses:

```text
Draft
Pending
Accepted
Preparing
Ready
Served
Payment Pending
Completed
Cancelled
```

Order details:

* Order number
* Organization
* Branch
* Table
* Staff
* Customer
* Items
* Selling units
* Quantities
* Notes
* Discounts
* Tax
* Service charge
* Total
* Payment status
* Timeline

---

# 19. TABLE & FLOOR MANAGEMENT

Create visual floor management.

Sections:

* Main Floor
* Lounge
* VIP
* Outdoor
* Bar

Table statuses:

* Available
* Occupied
* Reserved
* Payment Pending
* VIP
* Cleaning

Each table shows:

* Number
* Capacity
* Guest count
* Waiter
* Current order
* Amount
* Time occupied

Actions:

* Add order
* View order
* Transfer
* Reserve
* Request payment
* Close table

---

# 20. FLOOR DESIGNER

Web-only floor designer.

Managers can:

* Create floors
* Create sections
* Add tables
* Rename tables
* Set capacity
* Move tables
* Resize tables
* Configure VIP areas

Support a visual floor layout.

Mobile should use a simplified floor view, not the full designer.

---

# 21. BAR / KITCHEN

Create a bar and kitchen display.

Tabs:

**Bar**

**Kitchen**

Orders show:

* Order number
* Table
* Items
* Notes
* Time

Statuses:

Pending
Accepted
Preparing
Ready
Served

Actions:

Accept
Start
Ready
Served

Prepare for realtime updates.

---

# 22. PAYMENTS

Dunda needs customer payment functionality.

Payment flow:

```text
Order
↓
Checkout
↓
Payment
↓
Receipt
↓
Order Completed
```

Support configurable payment methods:

* Cash
* M-Pesa
* Card
* Other digital methods

Do not hardcode one provider.

Payment record:

* Order
* Amount
* Method
* Reference
* Status
* Cashier
* Branch
* Timestamp

Statuses:

Pending
Successful
Failed
Refunded
Partially Refunded

---

# 23. SPLIT PAYMENTS

Support:

```text
Total:
KES 5,000
```

Customer can pay:

```text
Cash:
KES 2,000

M-Pesa:
KES 3,000
```

Order becomes paid when the full amount has been successfully recorded.

---

# 24. REFUNDS & VOIDS

Authorized users can:

* Void order
* Refund payment
* Cancel item

Require:

* Permission
* Confirmation
* Reason
* Audit log

Never silently delete financial records.

---

# 25. RECEIPTS

Support:

* Printed receipts
* Digital receipts

Receipt includes:

* Club
* Branch
* Order number
* Items
* Selling units
* Quantities
* Prices
* Discounts
* Tax
* Service charge
* Total
* Payment method
* Date/time

Prepare for thermal receipt printers.

---

# 26. INVENTORY

Inventory categories:

* Spirits
* Beer
* Wine
* Soft drinks
* Mixers
* Food
* Ingredients
* Cigars
* Cigarettes
* Packaging
* Glassware
* Other

Inventory item fields:

* Product
* SKU
* Base unit
* Current quantity
* Reorder level
* Cost
* Supplier
* Branch

Stock movements:

* Purchase
* Sale
* Transfer
* Adjustment
* Waste
* Return
* Stock Count

---

# 27. INVENTORY DEDUCTION

When a sale is completed, inventory must update automatically.

Example:

```text
Inventory:
100 cigars

Sale:
3 cigars

Remaining:
97 cigars
```

For unit conversions:

```text
Inventory:
5 cigar boxes
20 pieces each

Total:
100 pieces

Sale:
3 pieces

Remaining:
97 pieces
```

The inventory transaction must record exactly what happened.

---

# 28. INVENTORY VARIANCE

Calculate expected inventory.

```text
Expected Stock
=
Opening Stock
+
Received
-
Sales
-
Waste
+
Transfers In
-
Transfers Out
+
Adjustments
```

Compare:

```text
Expected:
42

Actual:
38

Variance:
-4
```

Call this:

**Inventory discrepancy**

Do not automatically accuse staff of theft.

---

# 29. STOCK COUNT

Staff can perform stock counts.

Example:

```text
Jameson
Expected: 12
Actual: [ ]

Tusker
Expected: 84
Actual: [ ]

Cigars
Expected: 120
Actual: [ ]
```

Submit for review if required.

---

# 30. STOCK TRANSFERS

Support:

```text
Nairobi
↓
Mombasa
```

States:

Draft
Requested
Approved
In Transit
Received
Cancelled

Transfer history must be retained.

---

# 31. SUPPLIERS

Create supplier management.

Supplier:

* Name
* Contact
* Phone
* Email
* Products
* Branch
* Purchase history

Prepare for future purchase-order functionality.

---

# 32. CUSTOMERS

Customer profile:

* Name
* Phone
* Email
* Visits
* Total spend
* Last visit
* Reservations
* VIP status
* Notes

Respect role-based privacy.

---

# 33. RESERVATIONS

Reservation fields:

* Customer
* Phone
* Branch
* Date
* Time
* Guests
* Table
* Section
* Package
* Notes
* Status

Statuses:

Pending
Confirmed
Checked In
Completed
Cancelled
No Show

---

# 34. VIP MANAGEMENT

VIP functionality:

* VIP tables
* VIP packages
* Minimum spend
* Guest count
* Reservations
* VIP customers
* Check-in
* Running bill

Example:

```text
VIP TABLE 04

8 Guests

Premium Package

Minimum Spend:
KES 50,000

Status:
Reserved
```

---

# 35. EVENTS

Event fields:

* Name
* Branch
* Date
* Start time
* End time
* Description
* Capacity
* Status

Statuses:

Draft
Upcoming
Live
Completed
Cancelled

Event dashboard:

* Reservations
* Guests
* Revenue
* VIP bookings
* Table utilization
* Event sales

---

# 36. STAFF

Staff management:

* Name
* Role
* Branch
* Status
* Permissions
* Shift

Actions:

* Invite staff
* Assign role
* Assign branch
* Disable user
* View activity

---

# 37. STAFF SHIFTS

Support:

* Clock in
* Clock out
* Break
* Current shift
* Shift history

Managers can see current staff on duty.

---

# 38. REPORTS

Create:

### Sales Reports

Revenue
Orders
Average order

### Product Reports

Best-selling products
Slow-selling products
Category sales

### Inventory Reports

Stock
Movements
Waste
Discrepancies

### Staff Reports

Orders
Sales
Shifts

### Table Reports

Utilization
Revenue

### Payment Reports

Payment methods
Transactions
Refunds

### Event Reports

Revenue
Reservations
Guests

### Branch Reports

Branch sales
Orders
Inventory

### Organization Reports

Consolidated multi-branch information

Support filters:

* Date
* Branch
* Category
* Product
* Staff
* Payment method

---

# 39. DUNDA HQ

Create a dedicated organization-level HQ dashboard.

Show:

```text
Total Revenue
Total Orders
Active Branches
Inventory Alerts
Upcoming Events
```

Branch cards:

```text
Nairobi
Revenue
Orders
Tables

Mombasa
Revenue
Orders
Tables

Kisumu
Revenue
Orders
Tables
```

Support:

* Consolidated reporting
* Branch comparison
* Inventory alerts
* Stock transfers
* Staff overview
* Events overview

Present data neutrally rather than automatically labeling a branch "best" or "worst."

---

# 40. MOBILE APPLICATION

Build Dunda Mobile using:

* Expo
* React Native
* TypeScript
* Expo Router

The mobile application is for operational staff.

Primary users:

* Waiters
* Managers
* Inventory staff
* Event staff
* Floor staff

Do NOT simply shrink the web application.

Design mobile screens specifically for touch and one-handed use.

---

# 41. MOBILE LOGIN

Use the same Clerk authentication system.

After login:

* Organization
* Current branch
* Role

Allow branch switching only where authorized.

---

# 42. MOBILE NAVIGATION

Use role-based bottom navigation.

Possible:

Home
Tables
Orders
Inventory
Reservations
Events
Profile

Only display relevant modules.

---

# 43. MOBILE WAITER EXPERIENCE

Waiters should be able to:

* View assigned tables
* Open table
* View current order
* Add products
* Scan products
* Select selling unit
* Change quantity
* Add notes
* Submit order
* View order status
* Request payment
* Transfer table if permitted

---

# 44. MOBILE BARCODE SCANNER

Use phone camera barcode scanning.

Flow:

```text
Open Scanner
↓
Scan Barcode
↓
Identify Product
↓
Select Selling Unit if needed
↓
Add to Order
```

Example:

```text
Scan Cigar
↓
Cigar
KES 500
↓
Quantity 3
↓
Add to Order
```

---

# 45. MOBILE TABLES

Example:

```text
TABLE 12
6 Guests
KES 8,450
Occupied

TABLE 18
4 Guests
KES 4,200
Occupied

VIP 03
8 Guests
KES 35,500
VIP
```

Tap table to open order.

---

# 46. MOBILE ORDERING

Categories:

Beer
Spirits
Cocktails
Wine
Food
Soft Drinks
Cigars
Other

Product cards:

Name
Price
Add

For multi-unit products:

```text
WHISKY

Shot
KES 500

Glass
KES 1,000

Bottle
KES 8,000
```

Order summary:

Product
Unit
Quantity
Price
Total

Submit Order.

---

# 47. MOBILE MANAGER DASHBOARD

Managers see:

* Revenue
* Orders
* Active tables
* Low stock
* Reservations
* Events

Approvals:

* Discount
* Refund
* Void
* Inventory adjustment
* Stock transfer

Sensitive actions require confirmation.

---

# 48. MOBILE INVENTORY

Inventory staff can:

* Search products
* Scan barcodes
* View stock
* Count stock
* Receive stock
* Record waste
* Adjust stock
* Create transfers

---

# 49. MOBILE RESERVATIONS

Authorized staff can:

* View
* Create
* Confirm
* Check in
* Assign table
* Cancel

---

# 50. MOBILE EVENTS

Show:

* Upcoming events
* Event details
* Reservations
* Guests
* VIP
* Status

---

# 51. MOBILE NOTIFICATIONS

Notification center:

* New reservation
* Order ready
* Low stock
* Approval request
* Inventory discrepancy
* Stock transfer
* Event reminder

Prepare architecture for push notifications.

---

# 52. REALTIME

Prepare realtime events:

```text
ORDER_CREATED
ORDER_UPDATED
ORDER_STATUS_CHANGED
TABLE_STATUS_CHANGED
PAYMENT_COMPLETED
INVENTORY_UPDATED
RESERVATION_CREATED
RESERVATION_UPDATED
APPROVAL_REQUESTED
```

Example:

```text
Waiter Mobile
      ↓
Create Order
      ↓
Shared API
      ↓
PostgreSQL
      ↓
Realtime Event
      ↓
Bar / Kitchen
      ↓
Order Ready
      ↓
Waiter Mobile
```

No unnecessary manual refreshes where realtime is configured.

---

# 53. OFFLINE READINESS

Prepare architecture for unreliable internet.

Show:

Online
Offline
Syncing

Prepare an offline queue for appropriate operational actions.

Do not claim full offline POS functionality unless actually implemented.

---

# 54. DATABASE MODELS

Use Prisma.

Models:

```text
Organization
Branch
User
Role
Permission
OrganizationMember
BranchMember

Product
ProductUnit
ProductBarcode
Category

InventoryItem
InventoryUnit
UnitConversion
StockMovement
StockTransfer
StockTransferItem
StockCount
StockCountItem
Supplier

Floor
FloorSection
Table

Order
OrderItem
OrderItemUnit
Payment
Refund

Customer

Reservation
VIPPackage

Event
EventReservation

StaffShift

Notification

AuditLog

Subscription
```

Design proper relationships.

Every tenant-owned entity must be scoped appropriately.

---

# 55. PRODUCT UNIT DATA MODEL

A product should support multiple units.

Example:

```text
Product:
Cigar

Base Unit:
Piece

Selling Unit:
Piece
```

Another:

```text
Product:
Cigar Box

Base Unit:
Piece

Packaging:
Box

Conversion:
1 Box = 20 Pieces
```

Another:

```text
Product:
Whisky

Base Unit:
ml

Selling Units:

Shot = 30ml
Glass = 60ml
Bottle = 750ml
```

Unit conversion must be handled reliably by the backend.

Never rely on frontend calculations for inventory integrity.

---

# 56. SHARED TYPES

Create:

```text
packages/types
```

Use shared types for:

* Order
* OrderItem
* Product
* ProductUnit
* Inventory
* Table
* Branch
* Customer
* Reservation
* Event
* Payment

---

# 57. SHARED VALIDATION

Create:

```text
packages/validation
```

Use Zod schemas:

```text
CreateOrderSchema
UpdateOrderSchema
CreateProductSchema
CreateProductUnitSchema
CreateReservationSchema
StockCountSchema
StockTransferSchema
CreateEventSchema
PaymentSchema
RefundSchema
```

---

# 58. SHARED API

Create:

```text
packages/api
```

Both web and mobile consume the same API.

Examples:

```text
getCurrentUser()
getBranches()
getTables()
getProducts()
getProductByBarcode()
createOrder()
updateOrder()
getOrders()
updateOrderStatus()
getInventory()
createStockCount()
createStockTransfer()
getReservations()
createReservation()
getEvents()
createPayment()
createRefund()
```

---

# 59. SECURITY

Implement:

* Tenant isolation
* Branch isolation
* Server-side authorization
* Role permissions
* Input validation
* Secure authentication
* Audit logging

Never trust client-side permissions.

---

# 60. AUDIT LOGS

Track:

* Logins
* Product changes
* Price changes
* Discounts
* Voids
* Refunds
* Inventory adjustments
* Stock transfers
* Stock counts
* Staff changes
* Permission changes
* Reservation changes

Each record:

User
Action
Entity
Timestamp
Branch
Reason where applicable

Never silently delete financial or inventory records.

---

# 61. SETTINGS

Organization:

* Name
* Logo
* Currency
* Tax
* Service charge
* Receipt settings

Branch:

* Name
* Address
* Opening hours
* Floor
* Payment configuration

POS:

* Receipt printer
* Order numbering
* Discount rules
* Refund permissions

Security:

* Roles
* Permissions
* Audit logs

---

# 62. ONBOARDING

Create an onboarding wizard.

Step 1:

Create organization.

Step 2:

Create branch.

Step 3:

Set currency.

Step 4:

Create floor.

Step 5:

Add tables.

Step 6:

Add products.

Step 7:

Configure selling units and barcodes.

Step 8:

Add staff.

Step 9:

Ready to use Dunda.

---

# 63. SAAS BILLING

Prepare Dunda itself for SaaS subscriptions.

Plans can include:

### Starter

Small venues.

### Growth

Growing clubs.

### Pro

Large venues.

### Enterprise

Multi-branch organizations.

Subscription architecture should support:

* Monthly billing
* Annual billing
* Organization plan
* Branch limits
* User limits
* Feature limits

Do not implement real billing provider integration unless configured.

Dunda's SaaS subscription payments are separate from customer payments processed through the club POS.

---

# 64. PAYMENT ARCHITECTURE DISTINCTION

There are TWO payment systems.

## Customer payment

Customer pays the club:

```text
Customer
↓
Dunda POS
↓
Cash / M-Pesa / Card
↓
Club
```

## SaaS payment

Club pays Dunda:

```text
Club
↓
Dunda Subscription
↓
Payment Provider
↓
Dunda
```

Keep these systems separate in the architecture.

---

# 65. DESIGN SYSTEM

Dunda must NOT look like a generic AI-generated SaaS dashboard.

Design direction:

* Premium
* Modern
* Operational
* Clean
* Dark sophisticated navigation
* Light professional surfaces
* One strong brand accent
* Clear semantic status colors

Avoid:

* Excessive neon
* Excessive gradients
* Excessive glassmorphism
* Generic purple AI dashboards
* Giant unnecessary text
* Excessive rounded cards
* Random decorative elements

Dunda should feel like serious enterprise operational software.

---

# 66. POS DESIGN

The POS should prioritize:

**Speed over decoration.**

Use:

* Large product buttons
* Fast search
* Barcode input
* Keyboard shortcuts
* Touch-friendly controls
* Clear order summary
* Fast checkout

A cashier should be able to complete an order with minimal clicks.

---

# 67. MOBILE DESIGN

Optimize for:

* One-handed operation
* Large touch targets
* Fast navigation
* Bottom navigation
* Minimal typing
* Clear status indicators
* Fast product search
* Fast barcode scanning

---

# 68. RESPONSIVENESS

Web:

* Desktop
* Laptop
* Tablet

Mobile:

* iOS
* Android

---

# 69. DEMO ORGANIZATION

Create realistic demo data:

**Skyline Entertainment Group**

Branches:

* Nairobi
* Mombasa
* Kisumu

Sections:

* Main Floor
* Lounge
* VIP
* Outdoor
* Bar

Products:

* Beer
* Spirits
* Cocktails
* Wine
* Food
* Soft drinks
* Cigars
* Cigarettes
* Other

Use realistic KES pricing.

Create sample:

* Tables
* Orders
* Inventory
* Reservations
* Events
* Staff
* Customers

Clearly separate demo data from production data.

---

# 70. GLOBAL SEARCH

Web global search:

```text
Cmd/Ctrl + K
```

Search:

* Orders
* Products
* Customers
* Tables
* Reservations
* Events
* Staff

---

# 71. NOTIFICATIONS

Create notification center.

Notification types:

* Order ready
* Reservation
* Low stock
* Inventory discrepancy
* Approval
* Stock transfer
* Event

---

# 72. EMPTY STATES

Use useful empty states.

Example:

**No reservations yet**

"Create your first reservation to start managing upcoming guests."

Button:

**Create Reservation**

---

# 73. ERROR HANDLING

Do not expose raw errors.

Example:

Instead of:

```text
PrismaClientKnownRequestError
```

show:

**Unable to save the product. Please try again.**

---

# 74. LOADING

Use:

* Skeletons
* Inline loading
* Button loading
* Optimistic updates where safe

Avoid unnecessary full-page loading spinners.

---

# 75. DEVELOPMENT COMMANDS

Support:

```bash
pnpm dev
```

```bash
pnpm dev:web
```

```bash
pnpm dev:mobile
```

```bash
pnpm build
```

The monorepo should be structured for local development.

---

# 76. DEVELOPMENT PRIORITY

Build in phases.

## PHASE 1 — FOUNDATION

* Monorepo
* Web
* Mobile
* Database
* Prisma
* Authentication
* Organization
* Branches
* Roles
* Permissions
* Shared API
* Shared types
* Shared validation

## PHASE 2 — CORE POS

* Products
* Categories
* Units
* Unit conversions
* Barcodes
* POS
* Orders
* Tables
* Payments
* Receipts

## PHASE 3 — INVENTORY

* Stock
* Stock movements
* Stock counts
* Variance
* Transfers
* Suppliers
* Waste

## PHASE 4 — CLUB OPERATIONS

* Floor
* Bar
* Kitchen
* Staff
* Shifts
* Customers
* Reservations
* VIP
* Events

## PHASE 5 — MOBILE

* Waiter
* Tables
* Orders
* Barcode scanner
* Manager
* Inventory
* Reservations
* Events
* Notifications

## PHASE 6 — MANAGEMENT

* Reports
* Analytics
* HQ
* Audit logs
* Multi-branch

## PHASE 7 — ADVANCED

* Realtime
* Offline synchronization
* SaaS billing
* Integrations
* Advanced analytics

---

# 77. CRITICAL REAL-WORLD FLOW

The system must support this complete workflow:

```text
CLUB RECEIVES STOCK
        ↓
Inventory Manager
        ↓
Scan barcode
        ↓
Select packaging/unit
        ↓
Receive stock
        ↓
Inventory updated
        ↓
        ↓
CUSTOMER ARRIVES
        ↓
Waiter opens table
        ↓
Waiter creates order
        ↓
Search OR scan product
        ↓
Select selling unit
        ↓
Set quantity
        ↓
Submit order
        ↓
Bar/Kitchen receives order
        ↓
Order prepared
        ↓
Waiter serves customer
        ↓
Customer requests bill
        ↓
Checkout
        ↓
Cash / M-Pesa / Card
        ↓
Payment recorded
        ↓
Receipt generated
        ↓
Order completed
        ↓
Inventory automatically deducted
        ↓
Reports updated
        ↓
Branch dashboard updated
        ↓
Organization HQ updated
```

---

# 78. EXAMPLE PIECE-SALE FLOW

Dunda must support this exact type of transaction.

Inventory:

```text
Cigar Box
20 pieces
```

Inventory receives:

```text
5 boxes
```

Dunda calculates:

```text
100 pieces
```

Customer buys:

```text
3 cigars
```

POS:

```text
Cigar
Unit: Piece
Quantity: 3
Unit Price: KES 500
Total: KES 1,500
```

Inventory becomes:

```text
97 pieces
```

The inventory movement records:

```text
Product: Cigar
Movement: Sale
Quantity: -3 pieces
Order: #ORD-000123
Branch: Nairobi
Staff: Waiter
Timestamp: ...
```

---

# 79. EXAMPLE UNIT-CONVERSION FLOW

Inventory:

```text
Whisky
750ml bottle
```

Configured:

```text
Shot = 30ml
Glass = 60ml
Bottle = 750ml
```

Customer buys:

```text
2 shots
```

Inventory deduction:

```text
60ml
```

Customer later buys:

```text
1 bottle
```

Inventory deduction:

```text
750ml
```

All inventory calculations must use the configured base unit.

---

# 80. REAL-TIME BUSINESS STATE

All clients should reflect the same source of truth.

Example:

```text
Dunda Mobile
      │
      │ Create Order
      ↓
Shared API
      │
      ↓
PostgreSQL
      │
      ├──────────────→ Dunda Web POS
      │
      ├──────────────→ Bar Display
      │
      ├──────────────→ Kitchen Display
      │
      └──────────────→ Manager Mobile
```

No duplicated databases.

No duplicated order systems.

No separate inventory systems.

---

# 81. IMPORTANT DEVELOPMENT RULES

Do NOT:

* Create fake buttons
* Create fake backend calls
* Create disconnected mock systems
* Create duplicate databases
* Create duplicate business logic
* Connect mobile directly to PostgreSQL
* Hardcode tenant-specific logic
* Hardcode branch-specific logic
* Delete working functionality from the existing project
* Replace working architecture unnecessarily

Build reusable components.

Build real data relationships.

Build proper API boundaries.

Build server-side authorization.

Build the database schema properly.

---

# 82. FINAL PRODUCT

The final product should feel like a serious commercial SaaS platform.

A club should be able to:

```text
Create organization
↓
Create branches
↓
Create floors
↓
Create tables
↓
Create products
↓
Configure units
↓
Assign barcodes
↓
Receive stock
↓
Invite staff
↓
Open POS
↓
Scan/search products
↓
Sell products by piece/pack/bottle/glass/shot/portion
↓
Take payments
↓
Print receipts
↓
Track inventory
↓
Manage tables
↓
Manage reservations
↓
Manage VIP
↓
Manage events
↓
Monitor staff
↓
View reports
↓
Manage multiple branches
```

And staff should be able to do the same operational tasks from **Dunda Mobile** where their permissions allow.

The central principle is:

# ONE DUNDA PLATFORM

```text
                     DUNDA
                       │
          ┌────────────┴────────────┐
          │                         │
       WEB APP                  MOBILE APP
          │                         │
          └────────────┬────────────┘
                       │
                  SHARED API
                       │
                    PRISMA
                       │
                 POSTGRESQL
```

Build Dunda as a **real multi-tenant Club Operating System**, not a collection of dashboard mockups.

Prioritize:

**Working workflows → Data integrity → Security → Speed → Scalability → Premium UX.**
