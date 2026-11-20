# Issue #1098 — Search LP locks by underlying token on the Explorer

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1098  
**Status:** Open  
**Area:** `indexer/db.ts`, `indexer/index.ts`, `api/indexer-locks.ts`, `src/lib/indexer-client.ts`, `src/lib/queryLocks.ts`, `src/pages/Explorer.tsx`

---

## Problem

The Explorer looks up locks by one address, matched against `locks.token`:

```ts
// indexer/index.ts — getLocksForTokenPage
SELECT * FROM locks WHERE token = ? ORDER BY created_at ASC LIMIT ? OFFSET ?
```

For LP locks, the indexer sets `token` to the **pool-share** address. The pair's two
assets go in separate columns:

| Column       | Token lock     | LP lock                      |
|--------------|----------------|------------------------------|
| `token`      | token contract | pool-share contract          |
| `pool_share` | `NULL`         | pool-share contract          |
| `token_a`    | `NULL`         | first asset of the pair      |
| `token_b`    | `NULL`         | second asset of the pair     |

`token_a` and `token_b` are already stored. They come from the `lp_lock_created` event
data `(dex, token_a, token_b)`. However, they are not indexed, the API cannot query
them, and the Explorer never asks for them. Searching the USDC contract therefore
shows USDC token locks but no USDC/XLM LP locks. To check a project's locked
liquidity, a user has to already know the pool-share address.

---

## Proposed fix

### 1. Indexer: indexes

In `indexer/db.ts`, next to the existing `idx_locks_*` indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_locks_token_a ON locks(token_a);
CREATE INDEX IF NOT EXISTS idx_locks_token_b ON locks(token_b);
```

Both are `IF NOT EXISTS` and the columns already exist, so this needs no column
migration. Existing databases get the indexes on the next `initDb()`.

Rows written before the `(dex, token_a, token_b)` event shape existed have `NULL`
underlying tokens. They will not show up in this search until they are backfilled,
either by re-indexing from an earlier cursor or with a one-off script that reads
`get_lp_lock` for `kind = 'lp' AND token_a IS NULL`. Document whichever one is chosen
in [deploying-backend.md](./deploying-backend.md).

### 2. Indexer: query function

```ts
export function getLpLocksForUnderlyingPage(token: string, offset = 0, limit = 50): LockPage
```

```sql
SELECT * FROM locks
WHERE kind = 'lp' AND (token_a = ? OR token_b = ?)
ORDER BY created_at ASC, id ASC
LIMIT ? OFFSET ?
```

With a matching `COUNT(*)`. SQLite can answer the `OR` with both indexes, using a
multi-index OR scan. Confirm this with `EXPLAIN QUERY PLAN` in a test so that a future
schema change does not quietly fall back to a table scan.

### 3. API

Extend `api/indexer-locks.ts` with an `underlying` query parameter:

| Request                                    | Behaviour                                  |
|--------------------------------------------|--------------------------------------------|
| `?token=<addr>`                            | unchanged                                  |
| `?underlying=<addr>`                       | LP locks where `token_a` or `token_b` = addr |
| both or neither                            | `400 { error: "missing_token" }` / `"conflicting_params"` |

Keep the existing `offset` / `limit` clamping (max 100), the lag fields, and the
`503 indexer_unavailable` fallback contract. Validate `underlying` as a Stellar
contract address (`src/lib/stellar-address.ts`) before it reaches SQL.

Add `fetchIndexerLpLocksForUnderlying(token, offset, limit)` in
`src/lib/indexer-client.ts`, using the same cache and timeout as
`fetchIndexerLocksForToken`.

### 4. Explorer UI

Below the existing results for a searched token, add a section titled **"LP locks
containing this token"**:

- One row per LP lock: pair (`token_a / token_b` symbols), DEX, pool-share amount,
  unlock date, status, and a link to the lock.
- Load the section independently of the main results, and hide it when the count is 0.
- If the indexer returns 503, hide the section instead of falling back to RPC. The
  contract has no by-underlying index, so there is nothing cheap to fall back to.
  Show a short "Indexer unavailable — LP results hidden" note.
- When the searched address *is* a pool share, the current behaviour already applies
  and this section stays hidden.

---

## Tests

| Layer   | File                              | Cases                                                         |
|---------|-----------------------------------|---------------------------------------------------------------|
| Indexer | `indexer/db.test.ts`              | both new indexes exist after `initDb()`                       |
| Indexer | `indexer/index.test.ts`           | token matched as `token_a`, as `token_b`, neither; token locks excluded; paging and total |
| API     | `api/indexer.integration.test.ts` | `?underlying=` happy path, invalid address → 400, both params → 400, DB error → 503 |
| UI      | `src/pages/Explorer` test         | section renders with results, hidden on 0 results and on 503  |

---

## Acceptance criteria

- [ ] Searching a token on the Explorer lists LP locks whose pair contains that token.
- [ ] `idx_locks_token_a` / `idx_locks_token_b` exist and are used by the query.
- [ ] `/api/indexer-locks?underlying=` is implemented, validated and documented.
- [ ] Indexer and API tests cover the cases above.
