# How Dunda works, start to finish

A working description of the system: what it is, how a person gets access, how
money and stock move, and what is deliberately not built yet.

---

## 1. What it is

Club and venue software. A waiter takes an order at a table, the bar and kitchen
each work their own part of it, stock comes down when they hand it over, and the
owner sees the shift at close.

There are two separate products on one codebase:

| | Who | What they do |
|---|---|---|
| **The club app** | club staff | Take orders, work the pass, manage stock, view reports |
| **The operator console** | you | Provision clients, see every club, correct settings, read the audit trail |

They are separate deployments. Club users never receive operator code, and the
operator surface can be locked down far harder than something that has to open
on a tablet behind a bar.

---

## 2. The shape of the repository

```
artifacts/
  dunda/          the club app        (React + Vite)
  admin/          the operator console (React + Vite, separate build)
  api-server/     the API             (Express)
  mobile/         the phone app       (Expo, staff tools)
  mockup-sandbox/ design sandbox, not deployed
lib/
  db/             schema, migrations, database client
  api-spec/       OpenAPI contract
  api-zod/        server-side validation generated from the contract
  api-client-react/ typed client hooks generated from the same contract
scripts/          seeding, role sync, setup tokens
drizzle/          generated SQL migrations
```

`lib/api-spec/openapi.yaml` is the single source of truth. Server validation and
client hooks are both generated from it, so the two can't drift.

**46 tables.** Everything from organizations down to a single stock movement.

---

## 3. How a person gets access

This is the part worth understanding, because everything else hangs off it.

### Identity is Clerk's job

A person signs in however they like. Clerk issues a session token. The API
verifies it and gets back a Clerk user id — something like
`user_3JisOt291wRnAVQ4z1PrPhrQUpL`.

**Clerk knows who someone is. It knows nothing about what they may do.**

### Authority is the database's job

The token is looked up against `dunda_staff.clerk_user_id`. That row carries a
`role_id`, and the role carries permissions.

```
Clerk token  ->  user_3JisOt291wRnAVQ...
                    |
                    v
        dunda_staff WHERE clerk_user_id = ...
                    |
                    v
              role_id  ->  dunda_roles
                    |
                    v
        dunda_role_permissions -> 25 permissions
```

**The link is the entire authority mechanism.** No link, no access. A signed-in
account with no staff row gets a plain "your account isn't set up yet" and stops.
It never falls back to a default organization, because doing that would hand one
person another venue's sales.

### Roles

Eleven, in order of authority:

| Role | Sees |
|---|---|
| Organization Owner | everything |
| Administrator | everything below owner |
| General Manager | all branches, no branch administration |
| Branch Manager | their branch, including staff and floor |
| Event Manager | events, reservations, VIP |
| Inventory Manager | stock, catalog, transfers |
| Cashier | POS, tables, payment |
| Waiter | POS, tables, orders, reservations, customers |
| Bartender | the pass, stock |
| Kitchen Staff | the pass, stock |
| Floor Staff | POS, tables, reservations, customers |

**25 permissions**, not an is-admin flag. A waiter can take orders and close them
but cannot void one, refund, take payment, adjust stock or manage staff. Those
are separate permissions: `void_order`, `refund_payment`, `manage_payments`,
`adjust_inventory`, `manage_staff`.

### The owner boundary

Only an owner may hand out the owner role, and only while nobody holds it. There
is exactly one owner per organization. Changing who that is is a deliberate
transfer, which demotes the previous owner to Administrator rather than leaving
two people with identical authority and no record of which one decided.

`canGrantRole` is a single check, applied on both create and promote. It is tested
against a Branch Manager, a Waiter and an owner, because a privilege-escalation
hole here would hand one manager an entire business.

### Inviting somebody

An owner adds a name, email, role and branch. That creates a **pending** staff
record with no account attached. It shows as "Awaiting sign-up" and cannot be
used, because the person has no login yet.

When they sign up with that email, the first authenticated request claims the
record. Two rules make that safe:

- **Only records that have never been claimed are matched.** Once claimed, an
  email is inert, so signing up with a colleague's address inherits nothing.
- **Two pending records sharing an address claim neither.** Ambiguity fails
  closed and is logged.

Every claim is written to the audit log. This is the event most worth reviewing,
because it is the moment an account acquired a role.

---

## 4. Two order paths, on purpose

They solve different problems and they do not share a table.

### Tabs — the till

A waiter opens a tab against a table, adds items, and takes payment. This is the
POS. Adding a line updates the tab total immediately.

The tab **claims the table**: the row is set to `OCCUPIED` with the tab's id on
it. A second tab on the same table is refused with 409. Payment releases the
table and closes the tab.

### Orders — the pass

An order is what the bar and the kitchen work from. It splits into **station
tickets** and each advances through its own workflow:

```
PENDING -> ACCEPTED -> PREPARING -> READY -> SERVED
```

The state machine lives on the server, so a ticket cannot skip a stage because
somebody used a different screen.

### Why this matters

A table orders two whiskies and a steak. It becomes **two tickets** under one
order:

```
Order #000126 · T5 · 2,431
├── #000126-B   BAR       Whisky x2
└── #000126-K   KITCHEN   Steak x1
```

They share the bill but progress independently. Serving the drinks does not clear
the food from the pass — which is exactly what happened before station tickets
existed, when the bartender marking a ticket served removed the kitchen's items
too.

### Routing

Each category names the station that prepares it. A category may name a station
explicitly, because a club can as reasonably serve desserts from the bar as from
the kitchen. Otherwise routing falls back to the reporting group (drinks/food),
then to the bar.

### Which path does what

| | Tab (till) | Order (pass) |
|---|---|---|
| Created by | waiter, at the table | waiter, or a barcode scan |
| Station tickets | yes, one per station, reused across rounds | yes, created with the order |
| Stock deducts | at checkout | when each station serves its ticket |
| Table | claimed on open, released on payment | claimed on create, released when every ticket closes |

Both are live and both reach the boards. A tab is the POS surface; an order is
the production surface.

---

## 5. Stock

Products carry a **base unit** — millilitres for a spirit, plates for a meal,
bottles for beer. Every product also has **selling units** with a conversion
factor:

```
Jameson Irish Whiskey     base unit: ml
  Shot    30ml    500
  Glass   60ml  1,000
  Bottle 750ml  8,000
```

When something is sold, the base quantity is recorded against the line. A shot
of Jameson is 30ml, not 1.

Deduction happens when the station hands the ticket over, not when the order
closes — so each station is accountable for what it actually gave away, and a
ticket abandoned mid-service never deducts anything. A cancelled ticket gives
nothing back, because reversing something already poured is a manager's decision
rather than something the system should do silently.

Stock is allowed to go negative. That is visible and correctable; refusing a
sale at the till is not the system's call to make.

Every movement is recorded in `dunda_stock_movements`, and crossing the reorder
level raises or clears a low-stock alert automatically.

---

## 6. Money

Tax and service charge are **per organization** and were unreadable-by-design for
a long time: the server computed every total from hardcoded 16% and 10% while the
organization's own columns sat unused. Both are now read from the organization,
and an owner can correct them.

`calculateTotals` takes a subtotal and a discount and returns the breakdown.
Because each receipt rounds independently, summing a shift's orders differs
slightly from rounding the shift as one order — by a fraction of a percent. That
is correct: a guest cannot pay fractional shillings, and the components always
add up to the total on any given order.

**Money is stored as whole shillings.** No floats, anywhere.

---

## 7. Live updates

There is no WebSocket. It existed, and it was removed: a serverless function is
invoked per request and cannot hold a connection open.

Live screens poll instead, on an interval that matches how fast the thing
changes:

| Screen | Every |
|---|---|
| bar and kitchen boards | 5s |
| floor, tables, tabs | 10–15s |
| dashboard, activity | 30s |
| stock, alerts, reservations | 60s |

A backgrounded tab stops polling. The trade is more database traffic in exchange
for one platform and one origin — the screens still update on their own, which is
what the boards need.

---

## 8. Two deployments

Both deploy to Vercel from this repository, as separate projects.

**The club app** is a static bundle with an Express API beside it, one origin, no
CORS to configure.

**The operator console** is a separate app with its own `vercel.admin.json`, its
own domain, `noindex`, and frame denial.

### The operator side

Administrators are named by id in the environment:

```
PLATFORM_ADMIN_IDS=user_2abc...,user_2def...
```

Not a role and not a database table, deliberately. A permission could reach a
club owner through some future role-management path, and a table is only as safe
as the code that writes it. The environment is outside the application's reach —
no route, no migration and no bug can add a name to it. The cost is that granting
access means a redeploy, which is correct for a list of one to three people.

The operator can see every client with its usage, provision a new one, correct a
client's tax rate, take or hand over ownership, and read the audit trail across
all clients. **Orders are read-only to the operator** — the console counts them
and nothing more. A club's order book is their revenue, and support is read-only
by design.

### It is not discoverable

There is deliberately **no endpoint that says which side of the product an
account is on.** An endpoint answering that would tell every caller that a more
privileged tier exists.

On the club app's domain, a refused operator route answers exactly as an unknown
path does: `404 {"error": "Not found"}`. A caller probing for hidden surfaces
learns nothing about what is mounted.

---

## 9. What is deliberately absent

- **No self-serve signup.** Clients are provisioned. The landing page's "Start
  free" currently promises otherwise and leads to a dead end — **this is a known
  gap, not a decision.**
- **No operator impersonation of a client.** Read-only support.
- **No client-facing portal.** A club owner cannot see their own usage.
- **No per-client bespoke code.** Configurable, not forked.
- **No split bills or table merging.** Multiple payments per order work at the
  API; there is no UI.
- **No receipt printing.** No printer integration at all.
- **No offline support.** Nothing queues writes for later.
- **No tests for the React components**, and none for the mobile app.
- **Only order creation retries a dropped database connection.** Every other write
  will return 500 during a network blip, and this database is intermittently
  unreachable.

---

## 10. Things worth knowing before you build on this

**The most recent work found four real bugs in a single sitting** — a privilege
escalation, a table double-booking that a comment claimed was prevented, a
broken staff invite, and station tickets wired to a flow the UI never used. The
code is in good shape now and covered by 93 tests, but that ratio is the argument
for running `pnpm test` before believing anything works.

**The database connection is unreliable.** It is a managed instance reached over
the public internet and it drops connections. If you see a 500 on a query you
know is valid, suspect the network before the code.

**`staff.clerk_user_id` is globally unique**, so one account can hold a role at
only one organization. That is a real constraint for an operator who may need
access to several clubs, and it currently returns a clear 409 explaining it.
Lifting it means tenant resolution choosing which organization you are acting
in — a larger change than it looks.

**Two order paths exist because two workflows exist.** They are not redundant,
and merging them is not obviously right. The duplication between tabs and orders
is the source of a whole class of bug; unifying them would be a real improvement
and also a real piece of work.

---

## Running it

```bash
pnpm install
pnpm dev              # API and club app
pnpm dev:admin        # operator console, separately
pnpm dev:all          # all three

pnpm test              # 93 tests
pnpm verify            # typecheck, test, build
pnpm db:migrate        # apply migrations deliberately, never at build
pnpm db:setup-token    # bind an owner's account from the command line
pnpm db:sync:roles     # reconcile roles and permissions with the catalogue
```

`pnpm dev` runs the API on 3000 and the club app on 5173, with Vite proxying
`/api` across. Migrations are never run by a build.
