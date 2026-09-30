# Tests

`pnpm test` runs everything. `pnpm verify` typechecks, tests, then builds.

Suites live beside the code they exercise, so their dependencies resolve:

- **`tests/`** — decision logic with no database: the role grant boundary, the
  station split, the order status machine, money arithmetic, token hashing.
- **`lib/db/tests/`** — stock deduction and email-claim refusal, run against the
  real database because that is where stock and identity actually change.
- **`artifacts/api-server/tests/`** — the routes over real HTTP. Only the Clerk
  token check is stubbed; tenancy, permissions, transactions and database writes
  all run for real.

## What is pinned, and why

The suites cover the cases where being wrong is expensive rather than visible:

- Nobody below owner can grant the owner role, and there is only ever one owner.
- Stock deducts in the product's base unit, so a shot takes 30ml and a bottle
  750ml, and a tab line derives the same figure from its selling unit.
- Bar and kitchen get separate tickets, and each only sees its own lines.
- An order cannot skip a stage of the service workflow.
- An email claim only ever matches a record that has never been claimed, and
  claims nothing at all when two records share an address.
- A realtime ticket is single use, because a URL gets copied.
- A setup token is never recoverable from what is stored.
- A table cannot be double booked, and an order for a busy table is refused.
- A waiter cannot read or advance a station ticket.
- Tax and service charge come from the organization, not from a constant.
- Stock is deducted when a station serves a ticket, not when the order closes.

## The database

The database-backed suites need a reachable database and clean up after
themselves, including on failure. The provider is reached over the public
internet and drops pooled connections intermittently, so those calls are
retried — a transport failure is not a test failure, and is never reported as
one.

They create rows under a `test-` prefix and delete them in `afterAll`, including
after a failed run.
