# Issue #1097 — Show sibling locks of a split group on LockDetail

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1097  
**Status:** Open  
**Area:** `src/lib/token-locker.ts`, `src/lib/lp-locker.ts`, `src/pages/LockDetail.tsx`, `indexer/`

---

## Problem

Both contracts store split locks as a group, and the group can be read on-chain:

| Contract       | Read method                               | Returns                |
|----------------|-------------------------------------------|------------------------|
| `token-locker` | `get_split_group(group_id: u64)`          | `Option<SplitGroup>`   |
| `token-locker` | `get_split_groups_by_creator(creator, …)` | `Vec<SplitGroup>`      |
| `lp-locker`    | `get_split_group(group_id: u64)`          | `Option<SplitGroup>`   |
| `lp-locker`    | `get_split_groups_by_creator(creator, …)` | `Vec<SplitGroup>`      |

```rust
pub struct SplitGroup {
    pub group_id: u64,
    pub lock_ids: Vec<u64>,
}
```

Nothing in `src/` calls these methods. `src/lib/split-lock.ts` only *creates* split
locks. Each child is a normal `Lock`, so its LockDetail page shows that child's
beneficiary and amount and nothing else.

A community checking a team allocation such as "40% / 30% / 30% across three
founders" needs one link per child and has no way to confirm that the children belong
together or that they add up to the advertised total.

---

## How groups are laid out on-chain

From `create_split_lock` in both contracts:

- `group_id` is allocated first, and **the first child reuses it as its lock id**
  (`let lock_id = if i == 0 { group_id } else { get_id(&env) }`).
- The remaining children get the next ids from the same counter, in the same call,
  so a group's `lock_ids` are in creation order.
- Each child emits its own `lock_created` / `lp_lock_created` event. After that comes
  one summary event, `split_lock_created` / `lp_split_lock_created`, with
  `group_id` in its topics.
- The `Lock` struct has **no `group_id` field**. Given a child id, the contract has no
  way to look up its group.

The last point is the hard part. Given a group id, `get_split_group(id)` works. Given
an arbitrary child id, you have to find the group some other way.

---

## Proposed fix

### 1. Contract bindings

Add one read function to each locker binding, next to `getLock`:

```ts
// src/lib/token-locker.ts and src/lib/lp-locker.ts
export interface SplitGroup {
  groupId: string
  lockIds: string[]
}

export async function getSplitGroup(groupId: string): Promise<SplitGroup | null>
```

- Encode `group_id` as `u64` (`nativeToScVal(BigInt(groupId), { type: "u64" })`), the
  same as `getLock`.
- Decode `Option<SplitGroup>`: `scvVoid` → `null`, otherwise map `group_id` / `lock_ids`
  to strings.
- Add both methods to [contract-call-surface.md](./contract-call-surface.md) so that a
  spec-drift check covers them.

### 2. Child → group lookup

Use the indexer first and fall back to RPC, following the convention in
[data-sourcing.md](./data-sourcing.md).

**Indexer (primary).** Add a nullable `split_group_id TEXT` column to `locks` and an
index on it. In the `split_lock_created` / `lp_split_lock_created` handlers in
`indexer/index.ts`, which today only insert an event row, tag the children:

- Find the child rows by the same contract id and transaction as the summary event.
  The children's `lock_created` events come before the summary in the same
  transaction, so their rows already exist.
- Or call `get_split_group(group_id)` once and update `WHERE id IN (lock_ids)`.

Either way, the handler must not upsert a lock row. The existing comment explains why:
that would overwrite the first child with the group totals.

Return `splitGroupId` from `serializeLock` so that `/api/indexer-lock` (or the existing
lock lookup) gives LockDetail the group id directly. Add a migration test to
`indexer/db.test.ts` for the new column, following
[issue-1163-db-migration-smoke-tests.md](./issue-1163-db-migration-smoke-tests.md).

**RPC fallback.** When the indexer is unavailable:

1. Try `getSplitGroup(lock.id)`. This finds the group whenever the page is showing the
   first child.
2. Otherwise call `get_split_groups_by_creator(lock.creator)` and pick the group whose
   `lockIds` contains `lock.id`. Read only the first page: creators rarely have many
   split groups, and if the lock is not found there, hide the section rather than
   scanning every page.

### 3. LockDetail section

When a group is found, render a **"Part of split group #<groupId>"** card below the
lock details:

| Column      | Source                                                     |
|-------------|------------------------------------------------------------|
| Beneficiary | each sibling's `beneficiary` (shortened, copyable)         |
| Share       | sibling `amount` ÷ sum of all sibling amounts, shown as %  |
| Amount      | sibling `amount` (token decimals)                          |
| Status      | Locked / Unlocked / Withdrawn, the same badge as elsewhere |
| Link        | `/lock/<kind>/<id>`; the current lock is highlighted, not linked |

Notes:

- The contract does not store the share in basis points, so compute it from amounts.
  After withdrawals, compute it from the **original** amounts (`amount`, not
  remaining), so the split still reads as 40/30/30.
- Load siblings in parallel with the existing `getLock`, which `RpcClient` dedupes.
  Show a skeleton while they load, and hide the section on error. It should never
  block the main lock view.
- Add i18n keys under `lockDetail.splitGroup.*` for every locale file.

---

## Acceptance criteria

- [ ] `getSplitGroup` exists in both `token-locker.ts` and `lp-locker.ts`, with unit
      tests for `Some` and `None` decoding.
- [ ] A split child's LockDetail lists every sibling with beneficiary, share and status,
      and links to each sibling.
- [ ] The section works for the first child and for later children, through both the
      indexer and the RPC fallback.
- [ ] Non-split locks show no section, and make no extra RPC calls once the indexer
      reports `splitGroupId: null`.
