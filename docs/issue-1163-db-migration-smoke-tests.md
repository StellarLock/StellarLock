# Issue #1163 — Smoke tests for the indexer's DB migrations on old schemas

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1163  
**Status:** Open  
**Area:** `indexer/db.ts`, `indexer/db.test.ts`

---

## Problem

`initDb()` in `indexer/db.ts` brings any existing database up to the current schema
in place:

1. `CREATE TABLE/INDEX IF NOT EXISTS` for every table and index. On an old database
   this creates only what is missing and leaves existing tables unchanged.
2. **Unique subscription index.** If `idx_subs_address_lock` doesn't exist, it
   deletes all but the newest row (by `MAX(rowid)`) for each `(address, lock_id)`,
   creates the unique index and drops the old `idx_subs_address`, all in one
   transaction.
3. **`released` column.** If `locks` has no `released` column, it runs
   `ALTER TABLE locks ADD COLUMN released TEXT NOT NULL DEFAULT '0'`.

`indexer/db.test.ts` covers only part of this. Its legacy fixture contains
`notification_subscriptions` with duplicates and no other tables. It never builds a
`locks` table without `released`, and never runs a full old database through
`initDb()`. A migration that breaks on a real production database would surface only
at deploy time, when the indexer, notifier and API all call `initDb()` on startup.

---

## Historical schemas

Taken from the history of `git log -- indexer/db.ts`. Each fixture should reproduce
that version's DDL **exactly**, copied from the commit, not rewritten from memory.

| Fixture | Introduced in | `locks.released` | `notification_subscriptions` | Subscription indexes | Other notes |
|---|---|---|---|---|---|
| **v1** `pre-notifications` | `4624f77` / `48efbf1` (Jun–Jul 2026) | ❌ | ❌ table absent | — | `locks`, `lock_events`, `index_meta` only |
| **v2** `pre-released` | `071005f` (#39, Jul 2026) | ❌ | ✅ | `idx_subs_lock`, `idx_subs_address`, `idx_subs_pending` (no unique) | Duplicates per `(address, lock_id)` are possible |
| **v3** `pre-unique-subs` | `93c2f04` (Aug 2026) | ✅ | ✅ | same as v2 | No `idx_locks_created_at` |
| **v4** current | `6ca8806` (Sep 2026) | ✅ | ✅ | `idx_subs_address_lock` UNIQUE, no `idx_subs_address` | Idempotency baseline |

To extract a fixture's DDL:

```bash
git show 071005f:indexer/db.ts | sed -n '/db.exec(`/,/`)/p'
```

Seed each fixture with **representative rows**, not just empty tables:

- `locks`: one `token:` lock, one `lp:` lock with `dex`/`token_a`/`token_b`, and one
  lock with `withdrawn = 1`.
- `lock_events`: a few rows.
- `index_meta`: both `cursor` and `last_indexed_ledger`. Losing these on migration
  would force the indexer to resume from the latest ledger; see
  [deploying-backend.md](./deploying-backend.md#recovery).
- `notification_subscriptions` (v2, v3): at least two duplicate pairs with different
  `rowid` order, a non-duplicate row for the same address, and rows with
  `reminded_*` flags set.

---

## Test structure

`db.ts` opens `LOCK_INDEX_DB_PATH` **at import time**, and the module is cached. One
test file therefore binds to a single database. Choose one of:

- **One file per fixture**: `indexer/db.migrate.v1.test.ts`, `…v2…`, `…v3…`. This is
  the simplest option and matches the pattern already used in `db.test.ts`.
- **One file with `vi.resetModules()`**: in each `describe`, seed a fresh temp file,
  set `process.env.LOCK_INDEX_DB_PATH`, then `await import("./db")` again. Close the
  previous `db` handle in `afterEach`, or Windows CI cannot delete the temp file.

Put the DDL and seed rows in `indexer/__fixtures__/schemas.ts`, exported as
`{ v1, v2, v3 }` strings, so the tests and any future fixtures share them.

---

## Assertions for each fixture

Shared checks, run against every fixture after `initDb()`:

- **Converges on the current schema.** Compare `PRAGMA table_info(<t>)` for every
  table and `SELECT name, sql FROM sqlite_master WHERE type='index'` against a
  database freshly created by `initDb()`. Running this one comparison for each
  fixture catches most future drift.
- **Data preserved.** Every seeded `locks`, `lock_events` and `index_meta` row is
  still present with the same values. In particular, `getMeta("cursor")` and
  `getMeta("last_indexed_ledger")` are unchanged.
- **Idempotent.** A second `initDb()` doesn't throw and changes nothing.
- **Journal mode.** `PRAGMA journal_mode` returns `wal`.

Additional checks for specific fixtures:

| Fixture | Assert |
|---|---|
| v1 | `notification_subscriptions` and all its indexes are created; `locks.released` exists and is `'0'` for every pre-existing row, including the `withdrawn = 1` lock |
| v2 | `released` is back-filled as `'0'`; duplicates are collapsed to the highest `rowid` per pair; non-duplicate rows are kept; `reminded_*` flags on the surviving rows are unchanged; `idx_subs_address` is dropped |
| v3 | Only the subscription migration runs: `released` values that were already non-zero are **not** reset; `idx_locks_created_at` is created |

Add a failure-path test as well. Make the dedupe step fail partway (for example, open
the DB read-only, or add a trigger that raises on `DELETE`). Then assert that
`initDb()` throws and that the subscription table is unchanged, which shows the
transaction rolled back. Without this test nothing proves the migration is atomic.

Finally, after migrating each fixture, call `processEvent()` once with a
`lock_withdrawn` event against a migrated lock (see `indexer/index.test.ts` for how
events are built). This confirms that `released` accumulates from `'0'` as
`applyRelease()` assumes.

---

## Adding future migrations

When `initDb()` gains a new migration:

1. Freeze the schema before the change as a new fixture (`v5`, …) in
   `__fixtures__/schemas.ts`.
2. Add it to the shared assertions above.
3. Note it in this table.

---

## Acceptance criteria

- [ ] Fixtures v1, v2 and v3 exist, built from the DDL in the listed commits and
      seeded with representative rows.
- [ ] Each fixture is migrated by `initDb()` to a schema identical to a fresh
      database, with no data loss beyond the documented dedupe.
- [ ] The dedupe keeps the newest row per pair and is atomic.
- [ ] `pnpm test` runs the migration tests in CI.
