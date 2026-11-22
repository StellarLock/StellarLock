# Contract call surface: frontend vs contract signatures

The frontend builds Soroban `ScVal` arguments by hand in
[src/lib/token-locker.ts](../src/lib/token-locker.ts),
[src/lib/lp-locker.ts](../src/lib/lp-locker.ts) and
[src/lib/split-lock.ts](../src/lib/split-lock.ts).
[src/lib/contracts.generated.ts](../src/lib/contracts.generated.ts) only holds contract addresses,
so changing a contract signature (for example adding `metadata` to `create_lock`) does not cause
a TypeScript error. The mismatch only shows up as a failed simulation at runtime.

This page lists every contract method the frontend calls, with the exact argument order and
types it sends, so reviewers can check it when a signature changes. It also describes the CI
check proposed in issue #1157 to automate that.

Contract sources: [contracts/token-locker/src/lib.rs](../contracts/token-locker/src/lib.rs),
[contracts/lp-locker/src/lib.rs](../contracts/lp-locker/src/lib.rs), shared types in
[contracts/locker-common/src/lib.rs](../contracts/locker-common/src/lib.rs).

## Encoding rules used by the frontend

| Rust type | ScVal the frontend sends | Helper |
|---|---|---|
| `Address` | `scvAddress` | `new Address(addr).toScVal()` (`addressArg`) |
| `u64` (lock id, timestamps, bps) | `scvU64` | `nativeToScVal(BigInt(x), { type: "u64" })` (`idArg` for ids) |
| `u32` (offset, limit) | `scvU32` | `nativeToScVal(n, { type: "u32" })` |
| `i128` (amounts) | `scvI128` | `nativeToScVal(BigInt(stroops), { type: "i128" })` |
| `Option<T>` `None` | `scvVoid` | `xdr.ScVal.scvVoid()` |
| `Option<Vesting>` `Some` | `scvMap` with keys **sorted**: `end`, `released`, `start` | inline in `createLock` / `createSplitLock` |
| `LockMetadata` (not optional) | `scvMap` with keys **sorted**: `description`, `logo_url`, `project_url` (all `string`) | `metadataArg` |
| `Dex` enum (unit variant) | `scvVec([scvSymbol("Aquarius" \| "Soroswap")])` | `dexArg` |
| `Vec<(Address, u64)>` | `scvVec` of two-element `scvVec([address, u64])` | inline in `createSplitLock` |

Soroban rejects `scvMap` arguments whose keys are not sorted, so a field added to a struct must
also be inserted in sorted position in the hand-built map.

## token-locker

| Method | Contract signature (after `env`) | Frontend call site | Args sent |
|---|---|---|---|
| `create_lock` | `creator: Address, token: Address, amount: i128, beneficiary: Address, unlock_at: u64, vesting: Option<Vesting>, metadata: LockMetadata` → `u64` | `createLock` | address, address, i128, address, u64, map/void, map |
| `create_split_lock` | `creator: Address, token: Address, total_amount: i128, beneficiaries: Vec<(Address, u64)>, unlock_at: u64, vesting: Option<Vesting>` → `u64` | `createSplitLock` ([split-lock.ts](../src/lib/split-lock.ts)) | address, address, i128, vec, u64, map/void |
| `withdraw` | `id: u64` | `withdrawLock` | u64 |
| `extend` | `id: u64, new_unlock_at: u64` | `extendLock` | u64, u64 |
| `transfer_beneficiary` | `id: u64, new_beneficiary: Address` | `transferBeneficiary` | u64, address |
| `get_lock` | `id: u64` → `Option<Lock>` | `getLock` | u64 |
| `get_locks_by_creator` | `creator: Address, offset: u32, limit: u32` | `getLocksByCreator` | address, u32, u32 |
| `get_locks_by_beneficiary` | `beneficiary: Address, offset: u32, limit: u32` | `getLocksByBeneficiary` | address, u32, u32 |
| `get_locks_by_token` | `token: Address, offset: u32, limit: u32` | `getLocksByToken` | address, u32, u32 |
| `get_lock_count_by_creator` | `creator: Address` → `u32` | `getLockCountByCreator` | address |
| `get_lock_count_by_beneficiary` | `beneficiary: Address` → `u32` | `getLockCountByBeneficiary` | address |
| `get_lock_count_by_token` | `token: Address` → `u32` | `getLockCountByToken` | address |

## lp-locker

| Method | Contract signature (after `env`) | Frontend call site | Args sent |
|---|---|---|---|
| `create_lock` | `creator: Address, pool_share: Address, dex: Dex, token_a: Address, token_b: Address, amount: i128, beneficiary: Address, unlock_at: u64, vesting: Option<Vesting>, metadata: LockMetadata` → `u64` | `createLpLock` | address, address, enum, address, address, i128, address, u64, map/void, map |
| `withdraw` | `id: u64` | `withdrawLpLock` | u64 |
| `extend` | `id: u64, new_unlock_at: u64` | `extendLpLock` | u64, u64 |
| `transfer_beneficiary` | `id: u64, new_beneficiary: Address` | `transferLpBeneficiary` | u64, address |
| `get_lock` | `id: u64` → `Option<LpLock>` | `getLpLock` | u64 |
| `get_locks_by_creator` / `get_locks_by_beneficiary` | `Address, offset: u32, limit: u32` | `getLpLocksByCreator` / `getLpLocksByBeneficiary` | address, u32, u32 |
| `get_lock_count_by_creator` / `get_lock_count_by_beneficiary` | `Address` → `u32` | `getLpLockCountBy…` | address |

The frontend does not call `get_locks_by_pool_share`, `create_split_lock` (LP),
`get_split_group*`, `get_total_locked`, `get_global_stats`, or the admin, upgrade and pause
methods.

## SEP-41 token contracts

| Method | Args sent | Call site |
|---|---|---|
| `symbol`, `name`, `decimals` | none | `getOnChainTokenMeta` ([token-metadata.ts](../src/lib/token-metadata.ts)) |
| `balance` | `owner: Address` | `getTokenBalance` ([stellar.ts](../src/lib/stellar.ts)) |
| `allowance` | `owner: Address, spender: Address` | `getTokenAllowance` |
| `approve` | `owner: Address, spender: Address, amount: i128, expiration_ledger: u32` | `submitTokenApproval`, `lp-locker.ts` |

## Known drift risks

- **`create_split_lock` amount decimals.** `split-lock.ts` converts with `STELLAR_DECIMALS`
  (always 7). `create_lock` reads the token's real `decimals()` (issues #738/#740). A token with a
  different number of decimals would get the wrong split amount. The type check below cannot
  catch this because the type is still `i128`.
- **`create_split_lock` metadata.** The token-locker split method takes no `metadata` today. If
  it is added, `split-lock.ts` has to push a `metadataArg` in the right position. The proposed
  check below catches this.
- **Struct key order.** The `Vesting` and `LockMetadata` maps must stay in sorted key order. A
  renamed field fails only at simulation time.

## Proposed CI check (issue #1157)

Goal: CI fails when a frontend call no longer matches the contract spec.

1. **Build the contracts** (already done by `Dockerfile.contracts` / `contracts/deploy.sh`) so
   that `target/wasm32-unknown-unknown/release/{token_locker,lp_locker}.wasm` exist.
2. **Read the spec from the WASM.** Either
   - `stellar contract bindings typescript --wasm <file> --output-dir src/lib/bindings/<name>`,
     then type-check (`tsc --noEmit`) a small file that calls the generated `Client` methods
     with the same argument shapes the frontend uses, or
   - preferably, a Vitest spec test with no codegen: load each WASM, parse the
     `contractspecv0` custom section with `contract.Spec` from `@stellar/stellar-sdk`, and for
     every row in the tables above assert that the method exists, the argument count and order
     match, and that each `ScVal` the frontend builds converts with
     `spec.funcArgsToScVals(method, …)` / matches `spec.getFunc(method).inputs()` types.
3. **Record frontend calls in one place.** Today the method strings and argument arrays are
   inline. The test is easiest to write if each module exports its argument builders (for
   example `buildCreateLockArgs(args, source)`), so the test can call the real encoder and
   compare its output with the spec.
4. **Run it in CI** as a job that depends on the contract build and runs before
   "Frontend Checks" in [.github/workflows/ci.yml](../.github/workflows/ci.yml).

Until that check exists, any PR that changes a `pub fn` signature in `contracts/` should update
the matching encoder in `src/lib/` and this page in the same PR.
