#![no_std]

#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, vec,
    Address, Env, Symbol, Vec,
};

// ── TTL constants ─────────────────────────────────────────────────────────────
const LEDGERS_PER_DAY: u32 = 17_280;
const PERSISTENT_BUMP: u32 = 365 * LEDGERS_PER_DAY;
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP;
const INSTANCE_BUMP: u32 = 30 * LEDGERS_PER_DAY;
const INSTANCE_THRESHOLD: u32 = 7 * LEDGERS_PER_DAY;

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Lock(u64),
    NextId,
    ByCreator(Address),
    ByBeneficiary(Address),
    ByPoolShare(Address),
    TotalLocked(Address),
    GlobalLockCount,
    UniquePoolShareCount,
}

// ── Error types ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ContractError {
    AmountMustBePositive = 1,
    UnlockMustBeFuture   = 2,
    AlreadyWithdrawn     = 3,
    StillLocked          = 4,
    CanOnlyExtend        = 5,
}

// ── On-chain types ────────────────────────────────────────────────────────────

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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn next_id(env: &Env) -> u64 {
    let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(5000);
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

fn load_lock(env: &Env, id: u64) -> LpLock {
    env.storage()
        .persistent()
        .get(&DataKey::Lock(id))
        .expect("lock not found")
}

fn save_lock(env: &Env, lock: &LpLock) {
    let key = DataKey::Lock(lock.id);
    env.storage().persistent().set(&key, lock);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
}

fn collect_locks_paginated(env: &Env, ids: Vec<u64>, offset: u32, limit: u32) -> Vec<LpLock> {
    let mut out: Vec<LpLock> = vec![env];
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

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct LpLocker;

#[contractimpl]
impl LpLocker {
    /// Lock `amount` of pool-share tokens until `unlock_at` (unix seconds).
    /// Returns the new lock id.
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
    ) -> Result<u64, ContractError> {
        creator.require_auth();

        if amount <= 0 {
            return Err(ContractError::AmountMustBePositive);
        }
        let now = env.ledger().timestamp();
        if unlock_at <= now {
            return Err(ContractError::UnlockMustBeFuture);
        }

        token::Client::new(&env, &pool_share).transfer(
            &creator,
            &env.current_contract_address(),
            &amount,
        );

        let id = next_id(&env);
        let lock = LpLock {
            id,
            pool_share,
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
        };

        save_lock(&env, &lock);
        push_index(&env, DataKey::ByCreator(creator.clone()), id);
        push_index(&env, DataKey::ByBeneficiary(beneficiary.clone()), id);
        push_index(&env, DataKey::ByPoolShare(lock.pool_share.clone()), id);

        // Update per-pool-share TVL and global stats
        let current_tvl: i128 = env.storage().persistent().get(&DataKey::TotalLocked(lock.pool_share.clone())).unwrap_or(0);
        if current_tvl == 0 {
            let unique_count: u64 = env.storage().persistent().get(&DataKey::UniquePoolShareCount).unwrap_or(0);
            env.storage().persistent().set(&DataKey::UniquePoolShareCount, &(unique_count + 1));
        }
        env.storage().persistent().set(&DataKey::TotalLocked(lock.pool_share.clone()), &(current_tvl + amount));
        let lock_count: u64 = env.storage().persistent().get(&DataKey::GlobalLockCount).unwrap_or(0);
        env.storage().persistent().set(&DataKey::GlobalLockCount, &(lock_count + 1));

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
            (),
        );
        Ok(id)
    }

    /// Withdraw pool-share tokens. Callable by beneficiary after unlock_at.
    pub fn withdraw(env: Env, id: u64) -> Result<(), ContractError> {
        let mut lock = load_lock(&env, id);
        lock.beneficiary.require_auth();

        if lock.withdrawn {
            return Err(ContractError::AlreadyWithdrawn);
        }
        if env.ledger().timestamp() < lock.unlock_at {
            return Err(ContractError::StillLocked);
        }

        token::Client::new(&env, &lock.pool_share).transfer(
            &env.current_contract_address(),
            &lock.beneficiary,
            &lock.amount,
        );

        // Decrement TVL
        let current_tvl: i128 = env.storage().persistent().get(&DataKey::TotalLocked(lock.pool_share.clone())).unwrap_or(0);
        let new_tvl = (current_tvl - lock.amount).max(0);
        env.storage().persistent().set(&DataKey::TotalLocked(lock.pool_share.clone()), &new_tvl);

        lock.withdrawn = true;
        save_lock(&env, &lock);
        env.events().publish(
            (
                Symbol::new(&env, "lp_lock_withdrawn"),
                id,
                lock.beneficiary.clone(),
                lock.pool_share.clone(),
                lock.amount,
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
                Symbol::new(&env, "lp_lock_extended"),
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
                Symbol::new(&env, "lp_beneficiary_transferred"),
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

    pub fn get_lock(env: Env, id: u64) -> Option<LpLock> {
        env.storage().persistent().get(&DataKey::Lock(id))
    }

    pub fn get_locks_by_creator(env: Env, creator: Address, offset: u32, limit: u32) -> Vec<LpLock> {
        let ids = get_index(&env, DataKey::ByCreator(creator));
        collect_locks_paginated(&env, ids, offset, limit)
    }

    pub fn get_locks_by_beneficiary(env: Env, beneficiary: Address, offset: u32, limit: u32) -> Vec<LpLock> {
        let ids = get_index(&env, DataKey::ByBeneficiary(beneficiary));
        collect_locks_paginated(&env, ids, offset, limit)
    }

    pub fn get_lock_count_by_creator(env: Env, creator: Address) -> u32 {
        get_index(&env, DataKey::ByCreator(creator)).len()
    }

    pub fn get_lock_count_by_beneficiary(env: Env, beneficiary: Address) -> u32 {
        get_index(&env, DataKey::ByBeneficiary(beneficiary)).len()
    }

    pub fn get_locks_by_pool_share(env: Env, pool_share: Address, offset: u32, limit: u32) -> Vec<LpLock> {
        let ids = get_index(&env, DataKey::ByPoolShare(pool_share));
        collect_locks_paginated(&env, ids, offset, limit)
    }

    pub fn get_lock_count_by_pool_share(env: Env, pool_share: Address) -> u32 {
        get_index(&env, DataKey::ByPoolShare(pool_share)).len()
    }

    pub fn get_total_locked(env: Env, pool_share: Address) -> i128 {
        env.storage().persistent().get(&DataKey::TotalLocked(pool_share)).unwrap_or(0)
    }

    pub fn get_global_stats(env: Env) -> GlobalStats {
        let total_lock_count: u64 = env.storage().persistent().get(&DataKey::GlobalLockCount).unwrap_or(0);
        let unique_pool_share_count: u64 = env.storage().persistent().get(&DataKey::UniquePoolShareCount).unwrap_or(0);
        GlobalStats { total_lock_count, unique_pool_share_count }
    }
}
