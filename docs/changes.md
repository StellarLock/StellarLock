# Changes

> **Note:** This file is hand-written and documents the *rationale* behind selected
> changes, issue by issue. The release-by-release list of what shipped is generated
> automatically from conventional commit history into [`CHANGELOG.md`](../CHANGELOG.md)
> by the `changelog` workflow — don't maintain that list here by hand.

## #43 — DEX field encoding fix

The `dex` field in the LP locker contract was previously a free-form `String`, which risked encoding mismatches between the frontend and the contract.

**Fix:** Replaced with a typed `Dex` enum on-chain:

```rust
#[contracttype]
pub enum Dex {
    Aquarius,
    Soroswap,
}
```

On the frontend, the enum variant is encoded as a Soroban contracttype enum ScVal (`scvVec([scvSymbol("Aquarius")])`) to match exactly.

## #45 — Per-page SEO titles and meta descriptions

Every page previously showed the same generic title. Added `react-helmet-async` and per-page `<title>` / `<meta>` tags:

- Landing: `StellarLock — Token & LP Locks on Stellar`
- Create: `Create a Lock | StellarLock`
- My Locks: `My Locks | StellarLock`
- Explorer: `{TOKEN} Liquidity Locks | StellarLock`
- Lock Detail: `Lock #{id} — {SYMBOL} locked until {date} | StellarLock`

## #46 — Beneficiary transfer

Added `transfer_beneficiary(id, new_beneficiary)` to both contracts. Only the current beneficiary can call it. The beneficiary index is updated atomically.

```rust
pub fn transfer_beneficiary(env: Env, id: u64, new_beneficiary: Address) {
    let mut lock = load_lock(&env, id);
    lock.beneficiary.require_auth();
    // update index, set new beneficiary, save
}
```

Frontend: the Lock Detail page exposes a "Transfer beneficiary" action when the connected wallet is the current beneficiary.
