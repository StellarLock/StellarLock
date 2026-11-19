#![cfg_attr(not(test), no_std)]
// Soroban contract entry points (create_lock) take a fixed set of ABI
// arguments plus the `Env`, so `too_many_arguments` is not actionable here.
#![allow(clippy::too_many_arguments)]

#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, vec, Address, BytesN, Env,
    InvokeError, Symbol, Vec,
};

// ── Shared types, constants, and helpers from locker-common ──────────────────
use locker_common::{
    calculate_vested, collect_paginated, enter_guard, exit_guard, get_index, next_id, push_index,
    remove_from_index, INSTANCE_BUMP, INSTANCE_THRESHOLD, PERSISTENT_BUMP, PERSISTENT_THRESHOLD,
    RATE_LIMIT_COOLDOWN, RATE_LIMIT_TTL_LEDGERS, UPGRADE_DELAY, WITHDRAWN_BUMP,
    WITHDRAWN_THRESHOLD,
};
pub use locker_common::{LockMetadata, UpgradeProposal, Vesting};

// ── Lock duration bounds ──────────────────────────────────────────────────────
const MIN_LOCK_DURATION: u64 = 86_400; // 24 hours in seconds
const MAX_LOCK_DURATION: u64 = 315_360_000; // 10 years in seconds
const MAX_EXTENSIONS: u32 = 52; // Once per week for a year

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Lock(u64),
    NextId,
    ByCreator(Address),
    ByBeneficiary(Address),
    ByPoolShare(Address),
    SplitGroup(u64),
    SplitByCreator(Address),
    TotalLocked(Address),
    GlobalLockCount,
    UniquePoolShareCount,
    LastLockAt(Address),
    Admin,
    PendingAdmin,
    UpgradeProposal,
    ReentrancyGuard,
    Paused,
}

// ── Error types ───────────────────────────────────────────────────────────────
//
// Note: the `NotAdmin` variant (formerly 6) has been removed — it was never
// reachable because all admin-gated functions return `NotInitialized` when no
// admin is set, and `require_auth()` panics (rather than returning an error)
// when the caller is not the admin.  Keeping the variant would leave dead
// code that mutation tests could exploit.  Issue #723.

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ContractError {
    AmountMustBePositive = 1,
    UnlockMustBeFuture = 2,
    AlreadyWithdrawn = 3,
    StillLocked = 4,
    CanOnlyExtend = 5,
    NoPendingAdmin = 7,
    NotPendingAdmin = 8,
    ReentrancyDetected = 9,
    AmountOverflow = 10,
    LockNotFound = 11,
    TooFewBeneficiaries = 12,
    TooManyBeneficiaries = 13,
    SharesMustSum10000 = 14,
    VestingEndBeforeStart = 15,
    VestingOutsideLockBounds = 26,
    DuplicateBeneficiary = 27,
    NothingToRelease = 16,
    RateLimitExceeded = 17,
    NoPendingUpgrade = 18,
    TimelockNotElapsed = 19,
    IdenticalTokens = 20,
    LockDurationTooShort = 23,
    LockDurationTooLong = 24,
    ContractPaused = 21,
    ExtensionLimitExceeded = 22,
    NotInitialized = 25,
    AlreadyInitialized = 29,
    /// The pool contract exposes `token_a()`/`token_b()` getters but the
    /// addresses returned do not match the `token_a`/`token_b` arguments
    /// supplied by the caller.  Error code 28 is reserved for this variant.
    InvalidPoolTokens = 28,
}

// ── On-chain types ────────────────────────────────────────────────────────────
//
// Vesting, LockMetadata, and UpgradeProposal are re-exported from locker-common.

#[contracttype]
#[derive(Clone)]
pub struct GlobalStats {
    pub total_lock_count: u64,
    pub unique_pool_share_count: u64,
}

/// Typed DEX enum — avoids free-form string encoding mismatches.
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum Dex {
    Aquarius,
    Soroswap,
}

#[contracttype]
#[derive(Clone)]
pub struct SplitAllocation {
    pub beneficiary: Address,
    pub share_bps: u64,
    pub lock_id: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct SplitGroup {
    pub group_id: u64,
    pub lock_ids: Vec<u64>,
}

#[contracttype]
#[derive(Clone)]
pub struct LpLock {
    pub id: u64,
    pub pool_share: Address,
    pub dex: Dex,
    pub token_a: Address,
    pub token_b: Address,
    pub amount: i128,
    pub creator: Address,
    pub beneficiary: Address,
    pub unlock_at: u64,
    pub created_at: u64,
    pub extended_count: u32,
    pub withdrawn: bool,
    pub vesting: Vesting,
    pub metadata: LockMetadata,
}

// ── Contract-specific helpers ─────────────────────────────────────────────────

fn get_id(env: &Env) -> u64 {
    next_id(env, DataKey::NextId, 5_000)
}

fn load_lock(env: &Env, id: u64) -> Result<LpLock, ContractError> {
    env.storage()
        .persistent()
        .get(&DataKey::Lock(id))
        .ok_or(ContractError::LockNotFound)
}

fn save_lock(env: &Env, lock: &LpLock) {
    let key = DataKey::Lock(lock.id);
    env.storage().persistent().set(&key, lock);
    if lock.withdrawn {
        env.storage()
            .persistent()
            .extend_ttl(&key, WITHDRAWN_THRESHOLD, WITHDRAWN_BUMP);
    } else {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
    }
}

fn collect_locks_paginated(env: &Env, ids: Vec<u64>, offset: u32, limit: u32) -> Vec<LpLock> {
    collect_paginated(env, ids, offset, limit, DataKey::Lock)
}

fn guard_enter(env: &Env) -> Result<(), ContractError> {
    enter_guard(
        env,
        &DataKey::ReentrancyGuard,
        ContractError::ReentrancyDetected,
    )
}

fn guard_exit(env: &Env) {
    exit_guard(env, &DataKey::ReentrancyGuard);
}

fn require_not_paused(env: &Env) -> Result<(), ContractError> {
    let is_paused: bool = env
        .storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false);
    if is_paused {
        return Err(ContractError::ContractPaused);
    }
    Ok(())
}

fn validate_vesting_bounds(
    vesting: Option<&Vesting>,
    created_at: u64,
    unlock_at: u64,
) -> Result<(), ContractError> {
    if let Some(v) = vesting {
        if v.end <= v.start {
            return Err(ContractError::VestingEndBeforeStart);
        }
        if v.start < created_at || v.start > unlock_at {
            return Err(ContractError::VestingOutsideLockBounds);
        }
    }
    Ok(())
}

// ── Pool-token verification ───────────────────────────────────────────────────
//
// Performs a *best-effort* cross-contract check.  If the pool contract exposes
// `token_a()` and `token_b()` getters (Aquarius / Soroswap standard), we call
// them and compare the returned addresses against the `token_a` / `token_b`
// arguments supplied by the caller.  If the getters do not exist — or the
// cross-contract call fails for any other reason — we skip the check silently
// rather than blocking the lock.
//
// See contracts/README.md §"Pool-token verification" for a full discussion.
//
// Issue #732: Prevents callers from creating locks with mismatched token
// metadata by validating against the pool contract's own reported values.

fn verify_pool_tokens(
    env: &Env,
    pool_share: &Address,
    token_a: &Address,
    token_b: &Address,
) -> Result<(), ContractError> {
    // Try to call `token_a()` on the pool contract.
    // try_invoke_contract returns Err(_) when the call itself fails (e.g. the
    // function does not exist), which we treat as "interface not supported →
    // skip check".
    let reported_a: Address = match env
        .try_invoke_contract::<Address, InvokeError>(
            pool_share,
            &Symbol::new(env, "token_a"),
            vec![env],
        ) {
        Ok(Ok(addr)) => addr,
        // Call failed or getter absent — skip the check entirely.
        _ => return Ok(()),
    };

    let reported_b: Address = match env
        .try_invoke_contract::<Address, InvokeError>(
            pool_share,
            &Symbol::new(env, "token_b"),
            vec![env],
        ) {
        Ok(Ok(addr)) => addr,
        _ => return Ok(()),
    };

    // Accept either (token_a, token_b) or (token_b, token_a) — pool contracts
    // don't guarantee a canonical ordering.
    let matches = (token_a == &reported_a && token_b == &reported_b)
        || (token_a == &reported_b && token_b == &reported_a);
    if !matches {
        return Err(ContractError::InvalidPoolTokens);
    }

    Ok(())
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct LpLocker;

#[contractimpl]
impl LpLocker {
    /// Lock `amount` of pool-share tokens until `unlock_at` (unix seconds).
    /// Returns the new lock id.
    ///
    /// ## Pool-token verification (best-effort)
    ///
    /// Before accepting the lock this function attempts to verify that
    /// `token_a` and `token_b` match what the pool contract itself reports.
    /// It does so by calling the `token_a()` and `token_b()` getters on
    /// `pool_share` via a cross-contract call.
    ///
    /// **When the check is enforced:** if the pool contract exposes both
    /// `token_a()` and `token_b()` getters (Aquarius / Soroswap standard)
    /// and they return addresses that differ from the supplied `token_a` /
    /// `token_b` arguments, the call is rejected with
    /// [`ContractError::InvalidPoolTokens`] (error code 28).
    ///
    /// **When the check is skipped:** if the pool contract does not expose
    /// those getters, or if the cross-contract call fails for any other
    /// reason, the check is silently bypassed and the lock proceeds.
    pub fn create_lock(
        env: Env,
        creator: Address,
        pool_share: Address,
        dex: Dex,
        token_a: Address,
        token_b: Address,
        amount: i128,
        beneficiary: Address,
        unlock_at: u64,
        vesting: Option<Vesting>,
        metadata: LockMetadata,
    ) -> Result<u64, ContractError> {
        creator.require_auth();
        require_not_paused(&env)?;

        if amount <= 0 {
            return Err(ContractError::AmountMustBePositive);
        }
        let now = env.ledger().timestamp();
        if unlock_at <= now {
            return Err(ContractError::UnlockMustBeFuture);
        }

        let lock_duration = unlock_at.saturating_sub(now);
        if lock_duration < MIN_LOCK_DURATION {
            return Err(ContractError::LockDurationTooShort);
        }
        if lock_duration > MAX_LOCK_DURATION {
            return Err(ContractError::LockDurationTooLong);
        }

        if token_a == token_b {
            return Err(ContractError::IdenticalTokens);
        }

        // Best-effort pool-token check (issue #732).
        verify_pool_tokens(&env, &pool_share, &token_a, &token_b)?;

        // ── Rate limiting ─────────────────────────────────────────────────────
        let rate_key = DataKey::LastLockAt(creator.clone());
        let last_at: u64 = env.storage().temporary().get(&rate_key).unwrap_or(0);
        if now.saturating_sub(last_at) < RATE_LIMIT_COOLDOWN {
            return Err(ContractError::RateLimitExceeded);
        }

        validate_vesting_bounds(vesting.as_ref(), now, unlock_at)?;

        token::Client::new(&env, &pool_share).transfer(
            &creator,
            &env.current_contract_address(),
            &amount,
        );

        let id = get_id(&env);
        let lock = LpLock {
            id,
            pool_share: pool_share.clone(),
            dex,
            token_a,
            token_b,
            amount,
            creator: creator.clone(),
            beneficiary: beneficiary.clone(),
            unlock_at,
            created_at: now,
            extended_count: 0,
            withdrawn: false,
            vesting: vesting.unwrap_or_else(Vesting::none),
            metadata,
        };

        save_lock(&env, &lock);
        push_index(&env, DataKey::ByCreator(creator.clone()), id, false);
        push_index(&env, DataKey::ByBeneficiary(beneficiary.clone()), id, false);
        push_index(
            &env,
            DataKey::ByPoolShare(lock.pool_share.clone()),
            id,
            false,
        );

        // Update per-pool-share TVL and global stats
        let current_tvl: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalLocked(lock.pool_share.clone()))
            .unwrap_or(0);
        let new_tvl = current_tvl
            .checked_add(amount)
            .ok_or(ContractError::AmountOverflow)?;
        if current_tvl == 0 {
            let unique_count: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::UniquePoolShareCount)
                .unwrap_or(0);
            let new_unique_count = unique_count
                .checked_add(1)
                .ok_or(ContractError::AmountOverflow)?;
            env.storage()
                .persistent()
                .set(&DataKey::UniquePoolShareCount, &new_unique_count);
        }
        env.storage()
            .persistent()
            .set(&DataKey::TotalLocked(lock.pool_share.clone()), &new_tvl);
        let lock_count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::GlobalLockCount)
            .unwrap_or(0);
        let new_lock_count = lock_count
            .checked_add(1)
            .ok_or(ContractError::AmountOverflow)?;
        env.storage()
            .persistent()
            .set(&DataKey::GlobalLockCount, &new_lock_count);

        // Persist the rate-limit timestamp after all fallible operations succeed.
        env.storage().temporary().set(&rate_key, &now);
        env.storage().temporary().extend_ttl(
            &rate_key,
            RATE_LIMIT_TTL_LEDGERS,
            RATE_LIMIT_TTL_LEDGERS,
        );

        env.events().publish(
            (
                Symbol::new(&env, "lp_lock_created"),
                id,
                creator,
                lock.pool_share.clone(),
                amount,
                beneficiary,
                unlock_at,
            ),
            (lock.dex.clone(), lock.token_a.clone(), lock.token_b.clone()),
        );
        Ok(id)
    }

    /// Withdraw pool-share tokens. Callable by beneficiary after unlock_at.
    pub fn withdraw(env: Env, id: u64) -> Result<(), ContractError> {
        guard_enter(&env)?;
        let result = (|| {
            require_not_paused(&env)?;
            let mut lock = load_lock(&env, id)?;
            lock.beneficiary.require_auth();

            if lock.withdrawn {
                return Err(ContractError::AlreadyWithdrawn);
            }
            let now = env.ledger().timestamp();
            if now < lock.unlock_at {
                return Err(ContractError::StillLocked);
            }

            let releasable = if !lock.vesting.is_none() {
                let v = &mut lock.vesting;
                let vested = calculate_vested(lock.amount, v.start, v.end, now);
                let to_release = (vested - v.released).max(0);
                v.released += to_release;
                to_release
            } else {
                lock.amount
            };

            if releasable <= 0 {
                return Err(ContractError::NothingToRelease);
            }

            token::Client::new(&env, &lock.pool_share).transfer(
                &env.current_contract_address(),
                &lock.beneficiary,
                &releasable,
            );

            // Decrement TVL
            let current_tvl: i128 = env
                .storage()
                .persistent()
                .get(&DataKey::TotalLocked(lock.pool_share.clone()))
                .unwrap_or(0);
            let new_tvl = (current_tvl - releasable).max(0);
            env.storage()
                .persistent()
                .set(&DataKey::TotalLocked(lock.pool_share.clone()), &new_tvl);

            let fully_withdrawn = lock.vesting.is_none() || lock.vesting.released >= lock.amount;
            if fully_withdrawn {
                lock.withdrawn = true;
            }

            save_lock(&env, &lock);
            env.events().publish(
                (Symbol::new(&env, "lp_lock_withdrawn"), id),
                (
                    lock.beneficiary.clone(),
                    lock.pool_share.clone(),
                    releasable,
                ),
            );
            Ok(())
        })();
        guard_exit(&env);
        result
    }

    /// Extend the unlock date. Creator only, can only increase.
    pub fn extend(env: Env, id: u64, new_unlock_at: u64) -> Result<(), ContractError> {
        guard_enter(&env)?;
        let result = (|| {
            require_not_paused(&env)?;
            let mut lock = load_lock(&env, id)?;
            lock.creator.require_auth();

            if lock.withdrawn {
                return Err(ContractError::AlreadyWithdrawn);
            }
            if new_unlock_at <= lock.unlock_at {
                return Err(ContractError::CanOnlyExtend);
            }

            let now = env.ledger().timestamp();
            let new_lock_duration = new_unlock_at.saturating_sub(now);
            if new_lock_duration > MAX_LOCK_DURATION {
                return Err(ContractError::LockDurationTooLong);
            }

            if lock.extended_count >= MAX_EXTENSIONS {
                return Err(ContractError::ExtensionLimitExceeded);
            }

            let old_unlock_at = lock.unlock_at;
            lock.unlock_at = new_unlock_at;
            lock.extended_count += 1;

            save_lock(&env, &lock);
            env.events().publish(
                (Symbol::new(&env, "lp_lock_extended"), id),
                (lock.creator.clone(), old_unlock_at, new_unlock_at),
            );
            Ok(())
        })();
        guard_exit(&env);
        result
    }

    /// Transfer the beneficiary role to a new address. Current beneficiary only.
    pub fn transfer_beneficiary(
        env: Env,
        id: u64,
        new_beneficiary: Address,
    ) -> Result<(), ContractError> {
        guard_enter(&env)?;
        let result = (|| {
            require_not_paused(&env)?;
            let mut lock = load_lock(&env, id)?;
            lock.beneficiary.require_auth();

            if lock.withdrawn {
                return Err(ContractError::AlreadyWithdrawn);
            }

            let old_beneficiary = lock.beneficiary.clone();
            remove_from_index(&env, DataKey::ByBeneficiary(lock.beneficiary.clone()), id);
            push_index(
                &env,
                DataKey::ByBeneficiary(new_beneficiary.clone()),
                id,
                lock.withdrawn,
            );

            lock.beneficiary = new_beneficiary.clone();
            save_lock(&env, &lock);

            env.events().publish(
                (Symbol::new(&env, "lp_beneficiary_transferred"), id),
                (old_beneficiary, new_beneficiary),
            );
            Ok(())
        })();
        guard_exit(&env);
        result
    }

    /// Permissionless TTL maintenance — anyone can call this to prevent a lock
    /// entry from being archived before the beneficiary withdraws.
    pub fn bump_lock_ttl(env: Env, id: u64) {
        let key = DataKey::Lock(id);
        if env.storage().persistent().has(&key) {
            if let Ok(lock) = load_lock(&env, id) {
                if lock.withdrawn {
                    env.storage().persistent().extend_ttl(
                        &key,
                        WITHDRAWN_THRESHOLD,
                        WITHDRAWN_BUMP,
                    );
                } else {
                    env.storage().persistent().extend_ttl(
                        &key,
                        PERSISTENT_THRESHOLD,
                        PERSISTENT_BUMP,
                    );
                }
            }
        }
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    // ── Read methods ──────────────────────────────────────────────────────────

    pub fn get_lock(env: Env, id: u64) -> Option<LpLock> {
        env.storage().persistent().get(&DataKey::Lock(id))
    }

    pub fn get_locks_by_creator(
        env: Env,
        creator: Address,
        offset: u32,
        limit: u32,
    ) -> Vec<LpLock> {
        let ids = get_index(&env, DataKey::ByCreator(creator));
        collect_locks_paginated(&env, ids, offset, limit)
    }

    pub fn get_locks_by_beneficiary(
        env: Env,
        beneficiary: Address,
        offset: u32,
        limit: u32,
    ) -> Vec<LpLock> {
        let ids = get_index(&env, DataKey::ByBeneficiary(beneficiary));
        collect_locks_paginated(&env, ids, offset, limit)
    }

    pub fn get_lock_count_by_creator(env: Env, creator: Address) -> u32 {
        get_index(&env, DataKey::ByCreator(creator)).len()
    }

    pub fn get_lock_count_by_beneficiary(env: Env, beneficiary: Address) -> u32 {
        get_index(&env, DataKey::ByBeneficiary(beneficiary)).len()
    }

    pub fn get_locks_by_pool_share(
        env: Env,
        pool_share: Address,
        offset: u32,
        limit: u32,
    ) -> Vec<LpLock> {
        let ids = get_index(&env, DataKey::ByPoolShare(pool_share));
        collect_locks_paginated(&env, ids, offset, limit)
    }

    pub fn get_lock_count_by_pool_share(env: Env, pool_share: Address) -> u32 {
        get_index(&env, DataKey::ByPoolShare(pool_share)).len()
    }

    /// Create a split LP lock: transfer `total_amount` of pool-share tokens once,
    /// then divide it across 2–10 beneficiaries by basis-point shares (must sum to 10 000).
    /// Returns the group_id (which is also the lock_id of the first sub-lock).
    pub fn create_split_lock(
        env: Env,
        creator: Address,
        pool_share: Address,
        dex: Dex,
        token_a: Address,
        token_b: Address,
        total_amount: i128,
        beneficiaries: Vec<(Address, u64)>,
        unlock_at: u64,
        vesting: Option<Vesting>,
    ) -> Result<u64, ContractError> {
        creator.require_auth();
        require_not_paused(&env)?;

        if total_amount <= 0 {
            return Err(ContractError::AmountMustBePositive);
        }
        let now = env.ledger().timestamp();
        if unlock_at <= now {
            return Err(ContractError::UnlockMustBeFuture);
        }

        let lock_duration = unlock_at.saturating_sub(now);
        if lock_duration < MIN_LOCK_DURATION {
            return Err(ContractError::LockDurationTooShort);
        }
        if lock_duration > MAX_LOCK_DURATION {
            return Err(ContractError::LockDurationTooLong);
        }

        if token_a == token_b {
            return Err(ContractError::IdenticalTokens);
        }

        // Issue #732: best-effort pool-token verification.
        verify_pool_tokens(&env, &pool_share, &token_a, &token_b)?;

        let rate_key = DataKey::LastLockAt(creator.clone());
        let last_at: u64 = env.storage().temporary().get(&rate_key).unwrap_or(0);
        if now.saturating_sub(last_at) < RATE_LIMIT_COOLDOWN {
            return Err(ContractError::RateLimitExceeded);
        }

        validate_vesting_bounds(vesting.as_ref(), now, unlock_at)?;

        let n = beneficiaries.len();
        if n < 2 {
            return Err(ContractError::TooFewBeneficiaries);
        }
        if n > 10 {
            return Err(ContractError::TooManyBeneficiaries);
        }

        let mut total_bps: u64 = 0;
        for i in 0..n {
            let (beneficiary, bps) = beneficiaries.get(i).unwrap();
            if bps == 0 {
                return Err(ContractError::SharesMustSum10000);
            }
            for j in 0..i {
                let (existing, _) = beneficiaries.get(j).unwrap();
                if beneficiary == existing {
                    return Err(ContractError::DuplicateBeneficiary);
                }
            }
            total_bps += bps;
        }
        if total_bps != 10_000 {
            return Err(ContractError::SharesMustSum10000);
        }

        // Single transfer of the full amount up front.
        token::Client::new(&env, &pool_share).transfer(
            &creator,
            &env.current_contract_address(),
            &total_amount,
        );

        let group_id = get_id(&env);
        let mut lock_ids: Vec<u64> = vec![&env];
        let mut total_allocated: i128 = 0;

        for i in 0..n {
            let (beneficiary, bps) = beneficiaries.get(i).unwrap();
            let share_amount = if i == n - 1 {
                // Last beneficiary gets the remainder to avoid dust
                total_amount - total_allocated
            } else {
                let amount = total_amount
                    .checked_mul(bps as i128)
                    .ok_or(ContractError::AmountOverflow)?
                    / 10_000;
                total_allocated = total_allocated
                    .checked_add(amount)
                    .ok_or(ContractError::AmountOverflow)?;
                amount
            };
            if share_amount <= 0 {
                return Err(ContractError::AmountMustBePositive);
            }

            // The first sub-lock reuses group_id so the group_id is also a
            // valid lock id; subsequent sub-locks get their own ids.
            let lock_id = if i == 0 { group_id } else { get_id(&env) };

            let lock = LpLock {
                id: lock_id,
                pool_share: pool_share.clone(),
                dex: dex.clone(),
                token_a: token_a.clone(),
                token_b: token_b.clone(),
                amount: share_amount,
                creator: creator.clone(),
                beneficiary: beneficiary.clone(),
                unlock_at,
                created_at: now,
                extended_count: 0,
                withdrawn: false,
                vesting: vesting.clone().unwrap_or_else(Vesting::none),
                metadata: LockMetadata::empty(&env),
            };

            save_lock(&env, &lock);
            push_index(&env, DataKey::ByCreator(creator.clone()), lock_id, false);
            push_index(
                &env,
                DataKey::ByBeneficiary(beneficiary.clone()),
                lock_id,
                false,
            );
            push_index(
                &env,
                DataKey::ByPoolShare(pool_share.clone()),
                lock_id,
                false,
            );
            lock_ids.push_back(lock_id);

            // Each split-group child gets its own `lp_lock_created` event so
            // the indexer can track every child individually.
            env.events().publish(
                (
                    Symbol::new(&env, "lp_lock_created"),
                    lock_id,
                    creator.clone(),
                    pool_share.clone(),
                    share_amount,
                    beneficiary.clone(),
                    unlock_at,
                ),
                (dex.clone(), token_a.clone(), token_b.clone()),
            );
        }

        // Persist the split group record.
        let group = SplitGroup { group_id, lock_ids };
        env.storage()
            .persistent()
            .set(&DataKey::SplitGroup(group_id), &group);
        env.storage().persistent().extend_ttl(
            &DataKey::SplitGroup(group_id),
            PERSISTENT_THRESHOLD,
            PERSISTENT_BUMP,
        );
        push_index(
            &env,
            DataKey::SplitByCreator(creator.clone()),
            group_id,
            false,
        );

        env.storage().temporary().set(&rate_key, &now);
        env.storage().temporary().extend_ttl(
            &rate_key,
            RATE_LIMIT_TTL_LEDGERS,
            RATE_LIMIT_TTL_LEDGERS,
        );

        // Update TVL and global stats (mirrors create_lock logic).
        let current_tvl: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalLocked(pool_share.clone()))
            .unwrap_or(0);
        let new_tvl = current_tvl
            .checked_add(total_amount)
            .ok_or(ContractError::AmountOverflow)?;
        if current_tvl == 0 {
            let unique_count: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::UniquePoolShareCount)
                .unwrap_or(0);
            let new_unique_count = unique_count
                .checked_add(1)
                .ok_or(ContractError::AmountOverflow)?;
            env.storage()
                .persistent()
                .set(&DataKey::UniquePoolShareCount, &new_unique_count);
        }
        env.storage()
            .persistent()
            .set(&DataKey::TotalLocked(pool_share.clone()), &new_tvl);
        // Count every sub-lock individually so global stats stay consistent
        // with create_lock (one counter increment per lock record).
        let lock_count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::GlobalLockCount)
            .unwrap_or(0);
        let new_lock_count = lock_count
            .checked_add(n as u64)
            .ok_or(ContractError::AmountOverflow)?;
        env.storage()
            .persistent()
            .set(&DataKey::GlobalLockCount, &new_lock_count);

        env.events().publish(
            (
                Symbol::new(&env, "lp_split_lock_created"),
                group_id,
                creator,
                pool_share,
                total_amount,
                unlock_at,
            ),
            (),
        );
        Ok(group_id)
    }

    pub fn get_split_group(env: Env, group_id: u64) -> Option<SplitGroup> {
        env.storage()
            .persistent()
            .get(&DataKey::SplitGroup(group_id))
    }

    pub fn get_split_groups_by_creator(
        env: Env,
        creator: Address,
        offset: u32,
        limit: u32,
    ) -> Vec<SplitGroup> {
        let ids = get_index(&env, DataKey::SplitByCreator(creator));
        let mut out: Vec<SplitGroup> = vec![&env];
        let len = ids.len();
        let start = offset.min(len);
        let end = start.saturating_add(limit).min(len);
        let mut i = start;
        while i < end {
            let id = ids.get(i).unwrap();
            if let Some(group) = env.storage().persistent().get(&DataKey::SplitGroup(id)) {
                out.push_back(group);
            }
            i += 1;
        }
        out
    }

    pub fn get_total_locked(env: Env, pool_share: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalLocked(pool_share))
            .unwrap_or(0)
    }

    pub fn get_global_stats(env: Env) -> GlobalStats {
        let total_lock_count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::GlobalLockCount)
            .unwrap_or(0);
        let unique_pool_share_count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::UniquePoolShareCount)
            .unwrap_or(0);
        GlobalStats {
            total_lock_count,
            unique_pool_share_count,
        }
    }

    // ── Admin management ──────────────────────────────────────────────────────

    /// Return the current admin address, or `None` if the contract has not been
    /// initialised yet.
    pub fn get_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }

    /// Two-step admin transfer — step 1.  Current admin nominates `new_admin`
    /// as the pending admin.  The transfer is not complete until `new_admin`
    /// calls `accept_admin`.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
        env.events()
            .publish((Symbol::new(&env, "admin_proposed"), new_admin), ());
        Ok(())
    }

    /// Two-step admin transfer — step 2.  The pending admin accepts the role,
    /// atomically replacing the current admin and clearing the pending slot.
    pub fn accept_admin(env: Env) -> Result<(), ContractError> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(ContractError::NoPendingAdmin)?;
        pending.require_auth();
        env.storage().instance().set(&DataKey::Admin, &pending);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
        env.events()
            .publish((Symbol::new(&env, "admin_accepted"), pending), ());
        Ok(())
    }

    // ── Upgrade mechanism (7-day timelock) ───────────────────────────────────

    /// Must be called once after deployment to set the admin.
    ///
    /// Returns `ContractError::AlreadyInitialized` if called a second time,
    /// instead of panicking, so callers can distinguish "already initialised"
    /// from other errors programmatically. (Issue #722)
    ///
    /// Emits a `contract_initialized` event so indexers can record the exact
    /// deployment timestamp on-chain. (Issue #721)
    pub fn init(env: Env, admin: Address) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
        // Issue #721: emit an on-chain event so indexers can record the
        // deployment timestamp and admin address without relying on tx metadata.
        env.events().publish(
            (Symbol::new(&env, "contract_initialized"), admin),
            (),
        );
        Ok(())
    }

    pub fn propose_upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        admin.require_auth();
        let execute_after = env.ledger().timestamp() + UPGRADE_DELAY;
        let proposal = UpgradeProposal {
            new_wasm_hash,
            execute_after,
        };
        env.storage()
            .instance()
            .set(&DataKey::UpgradeProposal, &proposal);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
        env.events()
            .publish((Symbol::new(&env, "upgrade_proposed"), execute_after), ());
        Ok(())
    }

    /// Execute a previously proposed upgrade after the timelock has elapsed.
    ///
    /// Emits an `upgrade_executed` event with the new WASM hash so indexers
    /// and monitoring tools can track contract upgrades on-chain. (Issue #720)
    pub fn execute_upgrade(env: Env) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        admin.require_auth();
        let proposal: UpgradeProposal = env
            .storage()
            .instance()
            .get(&DataKey::UpgradeProposal)
            .ok_or(ContractError::NoPendingUpgrade)?;
        if env.ledger().timestamp() < proposal.execute_after {
            return Err(ContractError::TimelockNotElapsed);
        }
        env.storage().instance().remove(&DataKey::UpgradeProposal);
        // Issue #720: emit upgrade_executed before updating the WASM so the
        // event is always present in the transaction's footprint regardless
        // of whether the new code overwrites it.
        env.events().publish(
            (
                Symbol::new(&env, "upgrade_executed"),
                admin,
                proposal.new_wasm_hash.clone(),
            ),
            (),
        );
        env.deployer()
            .update_current_contract_wasm(proposal.new_wasm_hash);
        Ok(())
    }

    pub fn cancel_upgrade(env: Env) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        admin.require_auth();
        env.storage()
            .instance()
            .get::<_, UpgradeProposal>(&DataKey::UpgradeProposal)
            .ok_or(ContractError::NoPendingUpgrade)?;
        env.storage().instance().remove(&DataKey::UpgradeProposal);
        env.events()
            .publish((Symbol::new(&env, "upgrade_cancelled"),), ());
        Ok(())
    }

    // ── Emergency pause mechanism ─────────────────────────────────────────────

    /// Pause the contract, blocking lock creation, withdrawal, extension,
    /// and beneficiary transfer. Admin only.
    pub fn pause(env: Env) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
        env.events()
            .publish((Symbol::new(&env, "contract_paused"),), ());
        Ok(())
    }

    /// Unpause the contract, restoring normal operation. Admin only.
    pub fn unpause(env: Env) -> Result<(), ContractError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
        env.events()
            .publish((Symbol::new(&env, "contract_unpaused"),), ());
        Ok(())
    }
}
