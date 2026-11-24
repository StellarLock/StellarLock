# Issue #1134 — API's SQLite file isn't shared between Vercel functions and the indexer

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1134  
**Labels:** backend  
**Difficulty:** Hard

---

## Problem

Every `api/*` handler imports `db` from `indexer/db.ts`, which opens the file at `LOCK_INDEX_DB_PATH` (default: `lock-index.sqlite`) using `better-sqlite3`:

```ts
// indexer/db.ts
const DB_PATH = process.env.LOCK_INDEX_DB_PATH || 'lock-index.sqlite'
export const db = new Database(DB_PATH, { fileMustExist: false })
```

On Vercel, each serverless function runs in its own isolated instance with an **ephemeral, non-shared filesystem**. The indexer process (which writes lock and subscription data) runs elsewhere — in a Docker container, a VPS, or a separate Vercel Cron function. The two processes cannot see the same file, so:

- API handlers always read an empty database (the file is freshly created per instance).
- Subscriptions written by `subscribe.ts` vanish when the function instance is recycled.
- The notifier, if deployed as a Vercel Cron, cannot read subscriptions written by the API functions.

The result: indexer endpoints return empty data and subscriptions do not persist in production.

---

## Architecture

### Current (broken on Vercel)

```
  Vercel function instance A          Vercel function instance B
  ┌──────────────────────────┐        ┌──────────────────────────┐
  │  api/notifications/      │        │  indexer/notifier.ts     │
  │  subscribe.ts            │        │  (Vercel Cron / VPS)     │
  │                          │        │                          │
  │  opens lock-index.sqlite │        │  opens lock-index.sqlite │
  │  (ephemeral, local)      │        │  (ephemeral, different)  │
  └──────────────────────────┘        └──────────────────────────┘
         ↕ no shared state
```

### Target

```
  Vercel function instances (N)        Indexer / notifier
  ┌──────────────────────────┐        ┌──────────────────┐
  │  api/notifications/      │        │  indexer/*.ts    │
  │  subscribe.ts            │        │                  │
  │  unsubscribe.ts          │───────▶│                  │
  │  subscriptions.ts        │        │                  │
  │  indexer-*.ts            │        └──────────────────┘
  └──────────────────────────┘
         ↓ all via network
  ┌──────────────────────────┐
  │  Shared networked DB     │
  │  (libSQL/Turso, Postgres,│
  │   or Vercel KV)          │
  └──────────────────────────┘
```

---

## Task

Move persistent state to a networked database behind a repository layer at `indexer/db.ts`. Local development should continue to work with SQLite (no account required).

### Step 1 — Introduce a repository layer

Extract all direct `db.prepare(…).run/get/all` calls in `api/` into typed functions in `indexer/db.ts` (or a new `indexer/repository.ts`). This decouples the query logic from the driver so the driver can be swapped without touching `api/` files.

Minimal surface area needed by the API:

```ts
// indexer/repository.ts (new file)
export function getSubscription(address: string, lockId: string): SubscriptionRow | undefined
export function upsertSubscription(row: Omit<SubscriptionRow, 'created_at'>): void
export function deleteSubscription(address: string, lockId: string): void
export function listSubscriptions(address: string): SubscriptionRow[]
export function getLock(id: string): LockRow | undefined
export function getLocks(ids: string[]): LockRow[]
```

### Step 2 — Add a libSQL/Turso driver

[Turso](https://turso.tech) (libSQL) is the lowest-friction path: it offers a free tier, is wire-compatible with SQLite, and the `@libsql/client` package can open either a local file (`file:lock-index.sqlite`) or a remote URL (`libsql://…`).

```ts
import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:lock-index.sqlite',
  authToken: process.env.TURSO_AUTH_TOKEN,
})
```

When `TURSO_DATABASE_URL` is unset (local dev), the client opens the local SQLite file — no config change needed for existing contributors.

Alternatively, Vercel Postgres or Neon can be used if the team already has a Postgres preference; the repository interface insulates everything above from the choice.

### Step 3 — Update deployment documentation

Document the topology in `docs/indexer-architecture.md` (or update this file after the fix is merged):

- Production: `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (or equivalent) must be set in Vercel project settings and in the environment where the indexer runs.
- Local dev: leave both vars unset; the SQLite file is used automatically.
- The indexer process (wherever it runs) and all Vercel functions must share the same `TURSO_DATABASE_URL`.

---

## Env vars (new)

| Variable | Required in prod | Description |
|----------|-----------------|-------------|
| `TURSO_DATABASE_URL` | ✅ | libSQL connection string, e.g. `libsql://your-db.turso.io` |
| `TURSO_AUTH_TOKEN` | ✅ | Auth token issued by Turso |

Add both to `.env.example` with comments explaining that they can be left unset for local SQLite usage.

---

## Acceptance Criteria

- [ ] The API and the indexer/notifier share a networked DB in production
- [ ] Local development still works with the existing SQLite file (no env vars required)
- [ ] Deployment docs (`docs/indexer-architecture.md` or this file) describe the production topology and the required env vars
- [ ] `better-sqlite3` can be removed (or kept only for the local fallback path) once the libSQL driver is in place

---

## Related

- [Issue #1132](https://github.com/StellarLock/StellarLock/issues/1132) — rate limiting (also requires shared state across function instances)
- [Issue #1133](https://github.com/StellarLock/StellarLock/issues/1133) — subscription pruning (must run against the same DB)
- `indexer/db.ts` — current `better-sqlite3` setup and schema migrations
- `docs/indexer-architecture.md` — existing deployment notes
- [ADR-003](./adr/ADR-003-serverless-architecture.md) — serverless architecture context
