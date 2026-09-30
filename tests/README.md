# Tests

`pnpm test` runs everything. `pnpm verify` typechecks, tests, then builds.

Two kinds of suite live here:

- **`tests/`** — decision logic with no database: the role grant boundary, the
  station split, the order status machine, money arithmetic, token hashing.
- **`lib/db/tests/`** — the same rules exercised against the real database,
  inside transactions, because that is where stock and identity actually change.

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

## The database

The database-backed suites need a reachable database and clean up after
themselves, including on failure. The provider is reached over the public
internet and drops pooled connections intermittently, so those calls are
retried — a transport failure is not a test failure, and is never reported as
one.

They create rows under a `test-` prefix and delete them in `afterAll`.
