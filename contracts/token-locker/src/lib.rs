#![no_std]

#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, vec,
    Address, Env, Vec, Symbol,
};

#[cfg(test)]
mod tests;
#[cfg(test)]
mod prop_tests;

// ── TTL constants ─────────────────────────────────────────────────────────────
// 5-second ledger close → 17 280 ledgers per day.
const LEDGERS_PER_DAY: u32 = 17_280;
// Persistent lock/index entries are bumped to ~1 year on every write.
// Setting threshold == bump means we always top up to the network max.
const PERSISTENT_BUMP: u32 = 365 * LEDGERS_PER_DAY; // ~6 307 200 ledgers
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP;
// Instance storage (NextId) only needs to survive between administrative calls.
const INSTANCE_BUMP: u32 = 30 * LEDGERS_PER_DAY;
const INSTANCE_THRESHOLD: u32 = 7 * LEDGERS_PER_DAY;

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Minimum seconds between lock creations per creator address.
// Temporary storage entry lives slightly longer than the cooldown window.
const RATE_LIMIT_COOLDOWN: u64 = 60; // seconds
const RATE_LIMIT_TTL_LEDGERS: u32 = 720; // ~1 hour of ledgers (well above 60s cooldown)

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Lock(u64),
    NextId,
    ByCreator(Address),
    ByBeneficiary(Address),
    ByToken(Address),
    SplitGroup(u64),
    SplitByCreator(Address),
    TotalLocked(Address),
    GlobalLockCount,
    UniqueTokenCount,
    LastLockAt(Address),
}

// ── Error types ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ContractError {
    AmountMustBePositive   = 1,
    UnlockMustBeFuture     = 2,
    AlreadyWithdrawn       = 3,
    StillLocked            = 4,
    NothingToRelease       = 5,
    CanOnlyExtend          = 6,
    VestingEndBeforeStart  = 7,
    TooFewBeneficiaries    = 8,
    TooManyBeneficiaries   = 9,
    SharesMustSum10000     = 10,
    AmountMustBePositive  = 1,
    UnlockMustBeFuture    = 2,
    AlreadyWithdrawn      = 3,
    StillLocked           = 4,
    NothingToRelease      = 5,
    CanOnlyExtend         = 6,
    VestingEndBeforeStart = 7,
    RateLimitExceeded     = 8,
}

// ── On-chain types ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct SplitAllocation {
    pub beneficiary: Address,
    /// Basis points (0–10 000). All allocations in a group sum to 10 000.
    pub share_bps: u64,
    pub lock_id: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct SplitGroup {
    pub group_id: u64,
    pub lock_ids: Vec<u64>,
pub struct GlobalStats {
    pub total_lock_count: u64,
    pub unique_token_count: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct Vesting {
    pub start: u64,
    pub end: u64,
    pub released: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct Lock {
    pub id: u64,
    pub token: Address,
    pub amount: i128,
    pub creator: Address,
    pub beneficiary: Address,
    pub unlock_at: u64,
    pub created_at: u64,
    pub extended_count: u32,
    pub withdrawn: bool,
    pub vesting: Option<Vesting>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn next_id(env: &Env) -> u64 {
    let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1000);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));
    env.storage().instance().extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    id
}

fn push_index(env: &Env, key: DataKey, id: u64) {
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(vec![env]);
    ids.push_back(id);
    env.storage().persistent().set(&key, &ids);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
}

fn remove_from_index(env: &Env, key: DataKey, id: u64) {
    let ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(vec![env]);
    let mut filtered: Vec<u64> = vec![env];
    for existing in ids.iter() {
        if existing != id {
            filtered.push_back(existing);
        }
    }
    env.storage().persistent().set(&key, &filtered);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
}

fn get_index(env: &Env, key: DataKey) -> Vec<u64> {
    env.storage().persistent().get(&key).unwrap_or(vec![env])
}

fn load_lock(env: &Env, id: u64) -> Lock {
    env.storage()
        .persistent()
        .get(&DataKey::Lock(id))
        .expect("lock not found")
}

fn save_lock(env: &Env, lock: &Lock) {
    let key = DataKey::Lock(lock.id);
    env.storage().persistent().set(&key, lock);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
}

fn collect_locks_paginated(env: &Env, ids: Vec<u64>, offset: u32, limit: u32) -> Vec<Lock> {
    let mut out: Vec<Lock> = vec![env];
    let len = ids.len();
    let start = offset.min(len);
    let end = (start + limit).min(len);
    let mut i = start;
    while i < end {
        let id = ids.get(i).unwrap();
        if let Some(lock) = env.storage().persistent().get(&DataKey::Lock(id)) {
            out.push_back(lock);
        }
        i += 1;
    }
    out
}

/// Pure vesting math — extracted for property-based testing.
/// Returns the amount vested at `now` given a schedule from `start` to `end`.
/// Always in [0, amount].
pub(crate) fn calculate_vested(amount: i128, start: u64, end: u64, now: u64) -> i128 {
    if now < start || amount <= 0 {
        return 0;
    }
    let elapsed = now.saturating_sub(start) as i128;
    let duration = end.saturating_sub(start) as i128;
    if duration <= 0 {
        return amount;
    }
    // Saturating mul to avoid overflow on very large amounts / elapsed.
    let vested = amount.saturating_mul(elapsed) / duration;
    vested.min(amount).max(0)
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct TokenLocker;

#[contractimpl]
impl TokenLocker {
    /// Lock `amount` of `token` until `unlock_at` (unix seconds).
    /// Returns the new lock id.
    pub fn create_lock(
        env: Env,
        creator: Address,
        token: Address,
        amount: i128,
        beneficiary: Address,
        unlock_at: u64,
        vesting: Option<Vesting>,
    ) -> Result<u64, ContractError> {
        creator.require_auth();

        if amount <= 0 {
            return Err(ContractError::AmountMustBePositive);
        }
        let now = env.ledger().timestamp();
        if unlock_at <= now {
            return Err(ContractError::UnlockMustBeFuture);
        }

        // Enforce per-creator rate limit to prevent spam.
        let rate_key = DataKey::LastLockAt(creator.clone());
        let last_at: u64 = env.storage().temporary().get(&rate_key).unwrap_or(0);
        if now.saturating_sub(last_at) < RATE_LIMIT_COOLDOWN {
            return Err(ContractError::RateLimitExceeded);
        }

        if let Some(ref v) = vesting {
            if v.end <= v.start {
                return Err(ContractError::VestingEndBeforeStart);
            }
        }

        token::Client::new(&env, &token).transfer(
            &creator,
            &env.current_contract_address(),
            &amount,
        );

        let id = next_id(&env);
        let lock = Lock {
            id,
            token: token.clone(),
            amount,
            creator: creator.clone(),
            beneficiary: beneficiary.clone(),
            unlock_at,
            created_at: now,
            extended_count: 0,
            withdrawn: false,
            vesting,
        };

        save_lock(&env, &lock);
        push_index(&env, DataKey::ByCreator(creator.clone()), id);
        push_index(&env, DataKey::ByBeneficiary(beneficiary.clone()), id);
        push_index(&env, DataKey::ByToken(token.clone()), id);

        // Update per-token TVL and global stats
        let current_tvl: i128 = env.storage().persistent().get(&DataKey::TotalLocked(token.clone())).unwrap_or(0);
        if current_tvl == 0 {
            let unique_count: u64 = env.storage().persistent().get(&DataKey::UniqueTokenCount).unwrap_or(0);
            env.storage().persistent().set(&DataKey::UniqueTokenCount, &(unique_count + 1));
        }
        env.storage().persistent().set(&DataKey::TotalLocked(token.clone()), &(current_tvl + amount));
        let lock_count: u64 = env.storage().persistent().get(&DataKey::GlobalLockCount).unwrap_or(0);
        env.storage().persistent().set(&DataKey::GlobalLockCount, &(lock_count + 1));
        push_index(&env, DataKey::ByBeneficiary(beneficiary), id);
        push_index(&env, DataKey::ByToken(token), id);

        // Record the timestamp of this lock creation for rate-limiting future calls.
        env.storage().temporary().set(&rate_key, &now);
        env.storage().temporary().extend_ttl(&rate_key, RATE_LIMIT_TTL_LEDGERS, RATE_LIMIT_TTL_LEDGERS);

        env.events().publish(
            (
                Symbol::new(&env, "lock_created"),
                id,
                creator,
                token,
                amount,
                beneficiary,
                unlock_at,
            ),
            (),
        );
        Ok(id)
    }

    /// Withdraw locked tokens. Callable by the beneficiary after unlock_at.
    pub fn withdraw(env: Env, id: u64) -> Result<(), ContractError> {
        let mut lock = load_lock(&env, id);
        lock.beneficiary.require_auth();

        if lock.withdrawn {
            return Err(ContractError::AlreadyWithdrawn);
        }
        let now = env.ledger().timestamp();
        if now < lock.unlock_at {
            return Err(ContractError::StillLocked);
        }

        let releasable = if let Some(ref mut v) = lock.vesting {
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

        token::Client::new(&env, &lock.token).transfer(
            &env.current_contract_address(),
            &lock.beneficiary,
            &releasable,
        );

        // Decrement TVL
        let current_tvl: i128 = env.storage().persistent().get(&DataKey::TotalLocked(lock.token.clone())).unwrap_or(0);
        let new_tvl = (current_tvl - releasable).max(0);
        env.storage().persistent().set(&DataKey::TotalLocked(lock.token.clone()), &new_tvl);

        let fully_withdrawn = lock.vesting.as_ref().map_or(true, |v| v.released >= lock.amount);
        if fully_withdrawn {
            lock.withdrawn = true;
        }

        save_lock(&env, &lock);
        env.events().publish(
            (
                Symbol::new(&env, "lock_withdrawn"),
                id,
                lock.beneficiary.clone(),
                lock.token.clone(),
                releasable,
            ),
            (),
        );
        Ok(())
    }

    /// Extend the unlock date. Creator only, can only increase.
    pub fn extend(env: Env, id: u64, new_unlock_at: u64) -> Result<(), ContractError> {
        let mut lock = load_lock(&env, id);
        lock.creator.require_auth();

        if lock.withdrawn {
            return Err(ContractError::AlreadyWithdrawn);
        }
        if new_unlock_at <= lock.unlock_at {
            return Err(ContractError::CanOnlyExtend);
        }

        let old_unlock_at = lock.unlock_at;
        lock.unlock_at = new_unlock_at;
        lock.extended_count += 1;

        save_lock(&env, &lock);
        env.events().publish(
            (
                Symbol::new(&env, "lock_extended"),
                id,
                lock.creator.clone(),
                old_unlock_at,
                new_unlock_at,
            ),
            (),
        );
        Ok(())
    }

    /// Transfer the beneficiary role to a new address. Current beneficiary only.
    pub fn transfer_beneficiary(env: Env, id: u64, new_beneficiary: Address) -> Result<(), ContractError> {
        let mut lock = load_lock(&env, id);
        lock.beneficiary.require_auth();

        if lock.withdrawn {
            return Err(ContractError::AlreadyWithdrawn);
        }

        let old_beneficiary = lock.beneficiary.clone();
        remove_from_index(&env, DataKey::ByBeneficiary(lock.beneficiary.clone()), id);
        push_index(&env, DataKey::ByBeneficiary(new_beneficiary.clone()), id);

        lock.beneficiary = new_beneficiary.clone();
        save_lock(&env, &lock);

        env.events().publish(
            (
                Symbol::new(&env, "beneficiary_transferred"),
                id,
                old_beneficiary,
                new_beneficiary,
            ),
            (),
        );
        Ok(())
    }

    /// Permissionless TTL maintenance — anyone can call this to prevent a lock
    /// entry from being archived before the beneficiary withdraws.
    pub fn bump_lock_ttl(env: Env, id: u64) {
        let key = DataKey::Lock(id);
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
        }
        env.storage().instance().extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    // ── Read methods ──────────────────────────────────────────────────────────

    pub fn get_lock(env: Env, id: u64) -> Option<Lock> {
        env.storage().persistent().get(&DataKey::Lock(id))
    }

    pub fn get_locks_by_creator(env: Env, creator: Address, offset: u32, limit: u32) -> Vec<Lock> {
        let ids = get_index(&env, DataKey::ByCreator(creator));
        collect_locks_paginated(&env, ids, offset, limit)
    }

    pub fn get_locks_by_beneficiary(env: Env, beneficiary: Address, offset: u32, limit: u32) -> Vec<Lock> {
        let ids = get_index(&env, DataKey::ByBeneficiary(beneficiary));
        collect_locks_paginated(&env, ids, offset, limit)
    }

    pub fn get_locks_by_token(env: Env, token: Address, offset: u32, limit: u32) -> Vec<Lock> {
        let ids = get_index(&env, DataKey::ByToken(token));
        collect_locks_paginated(&env, ids, offset, limit)
    }

    pub fn get_lock_count_by_creator(env: Env, creator: Address) -> u32 {
        get_index(&env, DataKey::ByCreator(creator)).len()
    }

    pub fn get_lock_count_by_beneficiary(env: Env, beneficiary: Address) -> u32 {
        get_index(&env, DataKey::ByBeneficiary(beneficiary)).len()
    }

    pub fn get_lock_count_by_token(env: Env, token: Address) -> u32 {
        get_index(&env, DataKey::ByToken(token)).len()
    }

    /// Create multiple locks for different beneficiaries in one transaction.
    /// `beneficiaries` is a list of (address, share_bps) pairs; share_bps must
    /// sum to exactly 10 000 (= 100 %).
    /// Returns the group id (the first lock id of the batch).
    pub fn create_split_lock(
        env: Env,
        creator: Address,
        token: Address,
        total_amount: i128,
        beneficiaries: Vec<(Address, u64)>,
        unlock_at: u64,
        vesting: Option<Vesting>,
    ) -> Result<u64, ContractError> {
        creator.require_auth();

        if total_amount <= 0 {
            return Err(ContractError::AmountMustBePositive);
        }
        let now = env.ledger().timestamp();
        if unlock_at <= now {
            return Err(ContractError::UnlockMustBeFuture);
        }
        if let Some(ref v) = vesting {
            if v.end <= v.start {
                return Err(ContractError::VestingEndBeforeStart);
            }
        }

        let n = beneficiaries.len();
        if n < 2 {
            return Err(ContractError::TooFewBeneficiaries);
        }
        if n > 10 {
            return Err(ContractError::TooManyBeneficiaries);
        }

        let mut total_bps: u64 = 0;
        for i in 0..n {
            let (_, bps) = beneficiaries.get(i).unwrap();
            total_bps += bps;
        }
        if total_bps != 10_000 {
            return Err(ContractError::SharesMustSum10000);
        }

        // Transfer total into the contract first.
        token::Client::new(&env, &token).transfer(
            &creator,
            &env.current_contract_address(),
            &total_amount,
        );

        let group_id = next_id(&env);
        let mut lock_ids: Vec<u64> = vec![&env];

        for i in 0..n {
            let (beneficiary, bps) = beneficiaries.get(i).unwrap();
            let share_amount = (total_amount * bps as i128) / 10_000;

            let lock_id = if i == 0 { group_id } else { next_id(&env) };
            let lock = Lock {
                id: lock_id,
                token: token.clone(),
                amount: share_amount,
                creator: creator.clone(),
                beneficiary: beneficiary.clone(),
                unlock_at,
                created_at: now,
                extended_count: 0,
                withdrawn: false,
                vesting: vesting.clone(),
            };

            save_lock(&env, &lock);
            push_index(&env, DataKey::ByCreator(creator.clone()), lock_id);
            push_index(&env, DataKey::ByBeneficiary(beneficiary.clone()), lock_id);
            push_index(&env, DataKey::ByToken(token.clone()), lock_id);
            lock_ids.push_back(lock_id);
        }

        // Persist the group record for UI lookup.
        let group = SplitGroup { group_id, lock_ids };
        env.storage().persistent().set(&DataKey::SplitGroup(group_id), &group);
        env.storage().persistent().extend_ttl(&DataKey::SplitGroup(group_id), PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
        push_index(&env, DataKey::SplitByCreator(creator.clone()), group_id);

        env.events().publish(
            (
                Symbol::new(&env, "split_lock_created"),
                group_id,
                creator,
                token,
                total_amount,
                unlock_at,
            ),
            (),
        );
        Ok(group_id)
    }

    pub fn get_split_group(env: Env, group_id: u64) -> Option<SplitGroup> {
        env.storage().persistent().get(&DataKey::SplitGroup(group_id))
    }

    pub fn get_split_groups_by_creator(env: Env, creator: Address, offset: u32, limit: u32) -> Vec<SplitGroup> {
        let ids = get_index(&env, DataKey::SplitByCreator(creator));
        let mut out: Vec<SplitGroup> = vec![&env];
        let len = ids.len();
        let start = offset.min(len);
        let end = (start + limit).min(len);
        let mut i = start;
        while i < end {
            let id = ids.get(i).unwrap();
            if let Some(group) = env.storage().persistent().get(&DataKey::SplitGroup(id)) {
                out.push_back(group);
            }
            i += 1;
        }
        out
    pub fn get_total_locked(env: Env, token: Address) -> i128 {
        env.storage().persistent().get(&DataKey::TotalLocked(token)).unwrap_or(0)
    }

    pub fn get_global_stats(env: Env) -> GlobalStats {
        let total_lock_count: u64 = env.storage().persistent().get(&DataKey::GlobalLockCount).unwrap_or(0);
        let unique_token_count: u64 = env.storage().persistent().get(&DataKey::UniqueTokenCount).unwrap_or(0);
        GlobalStats { total_lock_count, unique_token_count }
    }
}
