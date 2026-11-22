# Issue #1133 — Prune subscriptions for withdrawn or long-expired locks

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1133  
**Labels:** enhancement, good first issue, backend  
**Difficulty:** Easy

---

## Problem

Rows in `notification_subscriptions` are never deleted after all reminders have been sent. Once `reminded_0d = 1` the notifier skips the row (the `WHERE reminded_0d = 0` filter excludes it), but the row stays in the table forever along with its PII (`email`, `webhook_url`).

The table grows indefinitely. Keeping email addresses after all notifications have been dispatched conflicts with data-minimisation principles and creates unnecessary GDPR surface.

---

## Context

The notifier runs hourly via `runNotifier()` in `indexer/notifier.ts`. Its current query:

```sql
SELECT * FROM notification_subscriptions WHERE reminded_0d = 0
```

This skips already-reminded rows entirely. The pruning logic should run as a final step in the same `runNotifier()` call.

The `locks` table in `indexer/db.ts` has a `status` column and a `withdrawn` column:

```sql
-- status: 'active' | 'unlocked' | 'withdrawn' | ...
-- withdrawn: 0 | 1
```

A subscription is a candidate for deletion when either of these holds:

1. **Fully reminded:** `reminded_0d = 1` and at least N days have elapsed since the lock's `unlock_at`.
2. **Withdrawn:** The lock's `withdrawn = 1` (the creator withdrew before or after unlock).

---

## Task

Add a `pruneSubscriptions()` helper (or inline SQL) called at the end of `runNotifier()`. The number of days to retain a subscription after unlock should be configurable.

### Implementation sketch

```ts
export function pruneSubscriptions(): void {
  const retainDays = Number(process.env.SUBSCRIPTION_RETAIN_DAYS ?? 7)
  const cutoffS = Math.floor(Date.now() / 1000) - retainDays * 86_400

  // Delete subscriptions where all reminders have been sent and
  // the lock unlocked more than retainDays ago, OR the lock was withdrawn.
  db.prepare(`
    DELETE FROM notification_subscriptions
    WHERE id IN (
      SELECT s.id
      FROM notification_subscriptions s
      JOIN locks l ON l.id = s.lock_id
      WHERE (s.reminded_0d = 1 AND l.unlock_at < ?)
         OR l.withdrawn = 1
    )
  `).run(cutoffS)
}
```

Call it at the end of `runNotifier()`:

```ts
export async function runNotifier(): Promise<void> {
  // ... existing dispatch logic ...
  pruneSubscriptions()
}
```

### Env var

| Variable | Default | Description |
|----------|---------|-------------|
| `SUBSCRIPTION_RETAIN_DAYS` | `7` | Days to keep a subscription after `unlock_at` before pruning |

Add to `.env.example`.

---

## Acceptance Criteria

- [ ] Rows with `reminded_0d = 1` and `lock.unlock_at` older than `SUBSCRIPTION_RETAIN_DAYS` are deleted on each notifier run
- [ ] Rows whose lock has `withdrawn = 1` are also deleted
- [ ] A unit test covers both pruning paths (use the existing `indexer/notifier.test.ts` or `indexer/db.test.ts`)
- [ ] `SUBSCRIPTION_RETAIN_DAYS` is documented in `.env.example`

---

## Related

- [Issue #1132](https://github.com/StellarLock/StellarLock/issues/1132) — rate limiting (reduces new subscription volume)
- [Issue #1134](https://github.com/StellarLock/StellarLock/issues/1134) — shared DB (pruning needs to run against the same DB instance as the notifier)
- `indexer/notifier.ts` — `runNotifier()`, `dueTiers()`, `dispatchJob()`
- `indexer/db.ts` — `notification_subscriptions` schema, `locks` schema
