# StellarLock Contracts

Two Soroban smart contracts that power StellarLock.

## Contracts

### `token-locker`

Locks SEP-41 tokens with an optional linear vesting schedule.

**Storage layout**
- `Lock(u64)` — lock struct by id
- `NextId` — auto-incrementing id counter (starts at 1000)
- `ByCreator(Address)` — index of lock ids per creator
- `ByBeneficiary(Address)` — index of lock ids per beneficiary
- `ByToken(Address)` — index of lock ids per token

**Key invariants**
- `unlock_at` can only increase, never decrease
- Only the beneficiary can withdraw, only after `unlock_at`
- Only the creator can extend
- Tokens are held by the contract until withdrawal

**Split locks** (`create_split_lock`)
- Lock one token amount, split across 2–10 beneficiaries via basis-point shares (must sum to 10 000)
- Each beneficiary receives an independent `Lock` sub-lock with their proportional amount; integer-division remainder goes to the last beneficiary (see [ADR-011](../docs/adr/ADR-011-split-lock-allocation.md))
- An optional vesting schedule applies uniformly to every sub-lock in the group
- The returned `group_id` is also the lock id of the first sub-lock; use `get_split_group` to enumerate all sub-lock ids
- Storage layout additions: `SplitGroup(u64)` — split group record by group_id; `SplitByCreator(Address)` — index of split group ids per creator

### `lp-locker`

Locks LP pool share tokens from Aquarius or Soroswap with optional linear vesting, matching `token-locker`'s vesting semantics. Carries additional `dex`, `token_a`, `token_b` fields to identify the underlying pool.

**Storage layout**
- `Lock(u64)` — lock struct by id
- `NextId` — auto-incrementing id counter (starts at 5000)
- `ByCreator(Address)` — index of lock ids per creator
- `ByBeneficiary(Address)` — index of lock ids per beneficiary
- `ByPoolShare(Address)` — index of lock ids per pool-share token
- `SplitGroup(u64)` — split group record by group_id
- `SplitByCreator(Address)` — index of split group ids per creator

**Key invariants**
- `unlock_at` can only increase, never decrease
- Only the beneficiary can withdraw, only after `unlock_at`
- Only the creator can extend
- Without a vesting schedule, the full amount is released at `unlock_at`
- With a vesting schedule, each withdrawal releases only the linearly vested
  portion since the last claim; the lock stays open until fully released

**Split locks** (`create_split_lock`)
- Transfer one pool-share token amount, split across 2–10 beneficiaries via basis-point shares (must sum to 10 000)
- Each beneficiary receives an independent `LpLock` sub-lock with their proportional amount; integer-division remainder goes to the last beneficiary (see [ADR-011](../docs/adr/ADR-011-split-lock-allocation.md))
- An optional vesting schedule applies uniformly to every sub-lock in the group
- The returned `group_id` is also the lock id of the first sub-lock; use `get_split_group` to enumerate all sub-lock ids
- TVL is counted once (total amount) and global lock count increments by the number of sub-locks

**Pool-token verification (best-effort)**

`create_lock` attempts to verify that the `token_a` and `token_b` arguments supplied by the caller match what the pool contract itself reports, by calling `token_a()` and `token_b()` getters on the `pool_share` address via a cross-contract call (added in [#732]).

| Scenario | Behaviour |
|---|---|
| Pool exposes `token_a()` / `token_b()` **and** returned addresses match | ✅ Lock proceeds normally |
| Pool exposes both getters **but** returned addresses differ from caller-supplied values | ❌ Rejected — `InvalidPoolTokens` (error 28) |
| Pool does **not** expose those getters, or the cross-contract call fails | ⚠️ Check silently skipped — lock proceeds with no token-pair guarantee |

**Security note:** a pool with a non-standard interface can bypass this check entirely by simply not implementing the getters. Integrators and auditors should not treat the presence of `token_a`/`token_b` fields on an `LpLock` as a cryptographic proof that the pool actually contains those tokens; it is a best-effort hint only.

## Error codes

The table below covers error codes that are relevant to integrators. The full list is in `lp-locker/src/lib.rs` (`ContractError`).

| Code | Name | Meaning |
|---|---|---|
| 1 | `AmountMustBePositive` | `amount` ≤ 0 |
| 2 | `UnlockMustBeFuture` | `unlock_at` is in the past |
| 3 | `AlreadyWithdrawn` | Lock has already been fully withdrawn |
| 4 | `StillLocked` | Withdrawal attempted before `unlock_at` |
| 5 | `CanOnlyExtend` | New unlock time is not later than current |
| 11 | `LockNotFound` | No lock exists for the given id |
| 16 | `NothingToRelease` | Vesting has not accrued any new amount since last withdrawal |
| 17 | `RateLimitExceeded` | Creator must wait before creating another lock |
| 20 | `IdenticalTokens` | `token_a` and `token_b` are the same address |
| 21 | `ContractPaused` | Contract is paused by admin |
| 22 | `ExtensionLimitExceeded` | Lock has been extended the maximum number of times |
| 23 | `LockDurationTooShort` | Lock duration is below the 24-hour minimum |
| 24 | `LockDurationTooLong` | Lock duration exceeds the 10-year maximum |
| 28 | `InvalidPoolTokens` | Pool's `token_a()`/`token_b()` getters returned addresses that do not match the caller-supplied `token_a`/`token_b` |

## Events

All contract events follow Soroban's `(topics, data)` layout, with `topics[0]` always carrying the event name as a `Symbol`.

> **Layout note for indexers:** `token-locker` puts all payload fields in `topics` and emits an empty `()` as `data`. By contrast, `lp-locker` places `(dex, token_a, token_b)` in `data` for `lp_lock_created`, and puts all payload fields in `data` (keeping only `(Symbol, id)` in `topics`) for `lp_lock_withdrawn`, `lp_lock_extended`, and `lp_beneficiary_transferred`. Both contracts share identical `(topics, data)` schemas for admin, upgrade, and pause events.

### `token-locker`

| Event Name | Topics | Data | Emitted When |
|---|---|---|---|
| `lock_created` | `(Symbol("lock_created"), id: u64, creator: Address, token: Address, amount: i128, beneficiary: Address, unlock_at: u64)` | `()` | A single lock is created via `create_lock`, or per child sub-lock inside `create_split_lock` |
| `split_lock_created` | `(Symbol("split_lock_created"), group_id: u64, creator: Address, token: Address, total_amount: i128, unlock_at: u64)` | `()` | Group-level summary emitted at the end of `create_split_lock` (`group_id` matches the first sub-lock's `id`) |
| `lock_withdrawn` | `(Symbol("lock_withdrawn"), id: u64, beneficiary: Address, token: Address, releasable: i128)` | `()` | `withdraw` transfers released tokens to `beneficiary` (emitted once per partial claim on vesting locks) |
| `lock_extended` | `(Symbol("lock_extended"), id: u64, creator: Address, old_unlock_at: u64, new_unlock_at: u64)` | `()` | `extend` increases a lock's `unlock_at` timestamp |
| `beneficiary_transferred` | `(Symbol("beneficiary_transferred"), id: u64, old_beneficiary: Address, new_beneficiary: Address)` | `()` | `transfer_beneficiary` reassigns a lock's `beneficiary` |
| `contract_initialized` | `(Symbol("contract_initialized"), admin: Address)` | `()` | `init` sets the initial admin address |
| `admin_proposed` | `(Symbol("admin_proposed"), new_admin: Address)` | `()` | `propose_admin` nominates a pending admin (step 1 of admin transfer) |
| `admin_accepted` | `(Symbol("admin_accepted"), new_admin: Address)` | `()` | `accept_admin` finalizes the pending admin transfer (step 2) |
| `upgrade_proposed` | `(Symbol("upgrade_proposed"), execute_after: u64, new_wasm_hash: BytesN<32>)` | `()` | `propose_upgrade` schedules a WASM upgrade with the 7-day timelock |
| `upgrade_executed` | `(Symbol("upgrade_executed"), admin: Address, new_wasm_hash: BytesN<32>)` | `()` | `execute_upgrade` applies a proposed WASM upgrade after the timelock elapses |
| `upgrade_cancelled` | `(Symbol("upgrade_cancelled"),)` | `()` | `cancel_upgrade` clears a pending upgrade proposal |
| `contract_paused` | `(Symbol("contract_paused"),)` | `()` | `pause` halts lock mutations (`create_lock`, `withdraw`, `extend`, `transfer_beneficiary`, `create_split_lock`) |
| `contract_unpaused` | `(Symbol("contract_unpaused"),)` | `()` | `unpause` restores normal contract operation |

### `lp-locker`

| Event Name | Topics | Data | Emitted When |
|---|---|---|---|
| `lp_lock_created` | `(Symbol("lp_lock_created"), id: u64, creator: Address, pool_share: Address, amount: i128, beneficiary: Address, unlock_at: u64)` | `(dex: Dex, token_a: Address, token_b: Address)` | A single LP lock is created via `create_lock`, or per child sub-lock inside `create_split_lock` |
| `lp_split_lock_created` | `(Symbol("lp_split_lock_created"), group_id: u64, creator: Address, pool_share: Address, total_amount: i128, unlock_at: u64)` | `()` | Group-level summary emitted at the end of `create_split_lock` (`group_id` matches the first sub-lock's `id`) |
| `lp_lock_withdrawn` | `(Symbol("lp_lock_withdrawn"), id: u64)` | `(beneficiary: Address, pool_share: Address, releasable: i128)` | `withdraw` transfers released LP pool-share tokens to `beneficiary` (emitted once per partial claim on vesting locks) |
| `lp_lock_extended` | `(Symbol("lp_lock_extended"), id: u64)` | `(creator: Address, old_unlock_at: u64, new_unlock_at: u64)` | `extend` increases an LP lock's `unlock_at` timestamp |
| `lp_beneficiary_transferred` | `(Symbol("lp_beneficiary_transferred"), id: u64)` | `(old_beneficiary: Address, new_beneficiary: Address)` | `transfer_beneficiary` reassigns an LP lock's `beneficiary` |
| `contract_initialized` | `(Symbol("contract_initialized"), admin: Address)` | `()` | `init` sets the initial admin address |
| `admin_proposed` | `(Symbol("admin_proposed"), new_admin: Address)` | `()` | `propose_admin` nominates a pending admin (step 1 of admin transfer) |
| `admin_accepted` | `(Symbol("admin_accepted"), new_admin: Address)` | `()` | `accept_admin` finalizes the pending admin transfer (step 2) |
| `upgrade_proposed` | `(Symbol("upgrade_proposed"), execute_after: u64, new_wasm_hash: BytesN<32>)` | `()` | `propose_upgrade` schedules a WASM upgrade with the 7-day timelock |
| `upgrade_executed` | `(Symbol("upgrade_executed"), admin: Address, new_wasm_hash: BytesN<32>)` | `()` | `execute_upgrade` applies a proposed WASM upgrade after the timelock elapses |
| `upgrade_cancelled` | `(Symbol("upgrade_cancelled"),)` | `()` | `cancel_upgrade` clears a pending upgrade proposal |
| `contract_paused` | `(Symbol("contract_paused"),)` | `()` | `pause` halts lock mutations (`create_lock`, `withdraw`, `extend`, `transfer_beneficiary`, `create_split_lock`) |
| `contract_unpaused` | `(Symbol("contract_unpaused"),)` | `()` | `unpause` restores normal contract operation |

## Build

```bash
stellar contract build
```

## Test

```bash
cargo test
```

## Deploy

```bash
./deploy.sh <account-alias>
```

## Deployed Addresses (Testnet)

| Contract | Address |
|---|---|
| token-locker | `CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW` |
| lp-locker | `CA3WYETNIF5IAF3VUNQ3SYKZFV45TOFBF7CEZ46I7QEBPWTRM73WLEI4` |
