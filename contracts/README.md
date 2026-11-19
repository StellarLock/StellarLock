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
