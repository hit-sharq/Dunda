# Deploying to Vercel

Both the web app and the API deploy from this repository as one Vercel project.

## What runs where

| | |
|---|---|
| **Web** | Static bundle built by Vite, served from the CDN. `artifacts/dunda/dist` |
| **API** | A single pre-bundled serverless function. Vercel discovers it at `api/index.mjs`; the build writes the real handler it re-exports. |
| **Database** | PostgreSQL (Neon). Nothing is bundled; `DATABASE_URL` is read at runtime. |

`vercel.json` maps `/api/*` to the function and everything else to `index.html`,
so the web app's client-side routes and its API calls share one origin. There is
no cross-origin request to configure.

Vercel only discovers serverless functions inside a root `api/` directory, so
that is where the entry point lives. It is a three-line wrapper: the actual
handler is pre-bundled to a single file by the build step, which means the
platform receives JavaScript rather than having to resolve the pnpm workspace and
compile the monorepo itself. The build command runs before functions are
compiled, so the bundle is in place by the time the wrapper is read.

## Environment variables

Set these in the Vercel project under **Settings → Environment Variables**.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Use the **pooled** connection string. The function is reused between requests, so keep the pool small. |
| `CLERK_SECRET_KEY` | yes | Server-side key from the Clerk dashboard. |
| `CLERK_PUBLISHABLE_KEY` | yes | The same key the web app uses. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | The web app reads the key under this name. |
| `ALLOWED_ORIGINS` | no | Defaults to the local development origins. On Vercel everything is same-origin, so it can be left unset. |
| `LOG_LEVEL` | no | Defaults to `info`. |
| `PORT` | no | Not used on Vercel; the standalone server only. |

## Realtime is polling, not a socket

A serverless function is invoked per request and cannot hold a connection open, so
the WebSocket bus that used to push updates has been removed. The bar and kitchen
boards now poll the same API every few seconds, and the floor, tabs and orders do
the same on a slower interval. A backgrounded tab stops polling.

This is a deliberate trade for running on Vercel: slightly more database traffic
in exchange for a single platform and one origin. The screens still update on
their own without anyone refreshing.

## Migrations

Builds never touch the database. Apply them deliberately:

```
pnpm db:migrate
```

`drizzle-kit migrate` is idempotent against a database that has already had them
applied, so re-running it is safe.

## Local development

Unaffected. The Vite dev server proxies `/api` to the standalone API on port
3000, including WebSocket upgrades for anything that still needs them.

```
pnpm dev
```

## Two things to know before going live

**Serverless functions have a request timeout.** The slowest operations are
report queries over a long date range. If one is reported as a timeout, raise
`maxDuration` in `vercel.json` rather than optimising blindly.

**The database connection is the fragile part.** A pooled connection can be
dropped between requests, and the function is reused. Order creation already
retries its transaction; if you see timeouts on other writes, the same treatment
is the fix.
