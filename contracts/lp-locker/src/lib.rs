#![cfg_attr(not(test), no_std)]
// Soroban contract entry points (create_lock) take a fixed set of ABI
// arguments plus the `Env`, so `too_many_arguments` is not actionable here.
#![allow(clippy::too_many_arguments)]

#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, vec, Address, BytesN, Env, String,
    Symbol, Vec,
};

// ── TTL constants ─────────────────────────────────────────────────────────────
const LEDGERS_PER_DAY: u32 = 17_280;
const PERSISTENT_BUMP: u32 = 365 * LEDGERS_PER_DAY;
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP;
const INSTANCE_BUMP: u32 = 30 * LEDGERS_PER_DAY;
const INSTANCE_THRESHOLD: u32 = 7 * LEDGERS_PER_DAY;
// Withdrawn locks get a short TTL — enough to be queried but not renewed forever (~11.6× cheaper).
const WITHDRAWN_BUMP: u32 = 30 * LEDGERS_PER_DAY;
const WITHDRAWN_THRESHOLD: u32 = 7 * LEDGERS_PER_DAY;

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
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
    Admin,
    PendingAdmin,
    UpgradeProposal,
    ReentrancyGuard,
}

const UPGRADE_DELAY: u64 = 7 * 24 * 3600;

#[contracttype]
#[derive(Clone)]
pub struct UpgradeProposal {
    pub new_wasm_hash: BytesN<32>,
    pub execute_after: u64,
}

// ── Error types ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ContractError {
    AmountMustBePositive = 1,
    UnlockMustBeFuture = 2,
    AlreadyWithdrawn = 3,
    StillLocked = 4,
    CanOnlyExtend = 5,
    NotAdmin = 6,
    NoPendingAdmin = 7,
    NotPendingAdmin = 8,
    ReentrancyDetected = 9,
    AmountOverflow = 10,
    LockNotFound = 11,
    TooFewBeneficiaries = 12,
    TooManyBeneficiaries = 13,
    SharesMustSum10000 = 14,
    VestingEndBeforeStart = 15,
    NothingToRelease = 16,
}

// ── On-chain types ────────────────────────────────────────────────────────────

/// Optional public-facing info about the locked project.
/// Stored on-chain as plain strings (not a hash) so the explorer can render
/// it directly — keep values short, this isn't meant for arbitrary blobs.
///
/// Not wrapped in `Option`: the #[contracttype] macro doesn't generate the
/// `Option<CustomStruct> -> ScVal` XDR bridge needed for std/testutils builds
/// (only the bare struct gets one), so "no metadata" is represented by all
/// fields being empty strings instead.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LockMetadata {
    pub description: String,
    pub project_url: String,
    pub logo_url: String,
}

impl LockMetadata {
    pub fn is_empty(&self) -> bool {
        self.description.is_empty() && self.project_url.is_empty() && self.logo_url.is_empty()
    }

    pub fn empty(env: &Env) -> Self {
        LockMetadata {
            description: String::from_str(env, ""),
            project_url: String::from_str(env, ""),
            logo_url: String::from_str(env, ""),
        }
    }
}

#[contracttype]
#[derive(Clone)]
pub struct GlobalStats {
    pub total_lock_count: u64,
    pub unique_pool_share_count: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct Vesting {
    pub start: u64,
    pub end: u64,
    pub released: i128,
}

impl Vesting {
    /// Sentinel for a lock without a vesting schedule.
    pub fn none() -> Self {
        Vesting {
            start: 0,
            end: 0,
            released: 0,
        }
    }

    /// A vesting schedule is "absent" when both timestamps are zero.
    pub fn is_none(&self) -> bool {
        self.start == 0 && self.end == 0
    }
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

// ── Helpers ───────────────────────────────────────────────────────────────────

fn next_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(5000);
    let next = id.saturating_add(1);
    env.storage().instance().set(&DataKey::NextId, &next);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    id
}

fn push_index(env: &Env, key: DataKey, id: u64, withdrawn: bool) {
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(vec![env]);
    ids.push_back(id);
    env.storage().persistent().set(&key, &ids);
    if withdrawn {
        env.storage()
            .persistent()
            .extend_ttl(&key, WITHDRAWN_THRESHOLD, WITHDRAWN_BUMP);
    } else {
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
    }
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
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
}

fn get_index(env: &Env, key: DataKey) -> Vec<u64> {
    env.storage().persistent().get(&key).unwrap_or(vec![env])
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
        // Withdrawn locks get a short TTL — enough to be queried but not renewed forever.
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
    let mut out: Vec<LpLock> = vec![env];
    let len = ids.len();
    let start = offset.min(len);
    let end = start.saturating_add(limit).min(len);
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

pub(crate) fn calculate_vested(amount: i128, start: u64, end: u64, now: u64) -> i128 {
    if now < start || amount <= 0 {
        return 0;
    }
    let elapsed = now.saturating_sub(start) as i128;
    let duration = end.saturating_sub(start) as i128;
    if duration <= 0 {
        return amount;
    }
    let vested = amount.saturating_mul(elapsed) / duration;
    vested.min(amount).max(0)
}

fn enter_guard(env: &Env) -> Result<(), ContractError> {
    if env.storage().temporary().has(&DataKey::ReentrancyGuard) {
        return Err(ContractError::ReentrancyDetected);
    }
    env.storage()
        .temporary()
        .set(&DataKey::ReentrancyGuard, &true);
    env.storage()
        .temporary()
        .extend_ttl(&DataKey::ReentrancyGuard, 1, 1);
    Ok(())
}

fn exit_guard(env: &Env) {
    env.storage().temporary().remove(&DataKey::ReentrancyGuard);
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
        vesting: Option<Vesting>,
        metadata: LockMetadata,
    ) -> Result<u64, ContractError> {
        creator.require_auth();

        if amount <= 0 {
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

        token::Client::new(&env, &pool_share).transfer(
            &creator,
            &env.current_contract_address(),
            &amount,
        );

        let id = next_id(&env);
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
        enter_guard(&env)?;
        let result = (|| {
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
                (lock.beneficiary.clone(), lock.pool_share.clone(), lock.amount),
                (
                    lock.beneficiary.clone(),
                    lock.pool_share.clone(),
                    releasable,
                ),
            );
            Ok(())
        })();
        exit_guard(&env);
        result
    }

    /// Extend the unlock date. Creator only, can only increase.
    pub fn extend(env: Env, id: u64, new_unlock_at: u64) -> Result<(), ContractError> {
        enter_guard(&env)?;
        let result = (|| {
            let mut lock = load_lock(&env, id)?;
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
                (Symbol::new(&env, "lp_lock_extended"), id),
                (lock.creator.clone(), old_unlock_at, new_unlock_at),
            );
            Ok(())
        })();
        exit_guard(&env);
        result
    }

    /// Transfer the beneficiary role to a new address. Current beneficiary only.
    pub fn transfer_beneficiary(
        env: Env,
        id: u64,
        new_beneficiary: Address,
    ) -> Result<(), ContractError> {
        enter_guard(&env)?;
        let result = (|| {
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
        exit_guard(&env);
        result
    }

    /// Permissionless TTL maintenance — anyone can call this to prevent a lock
    /// entry from being archived before the beneficiary withdraws.
    pub fn bump_lock_ttl(env: Env, id: u64) {
        let key = DataKey::Lock(id);
        if env.storage().persistent().has(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, PERSISTENT_THRESHOLD, PERSISTENT_BUMP);
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
            if bps == 0 {
                return Err(ContractError::SharesMustSum10000);
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

        let group_id = next_id(&env);
        let mut lock_ids: Vec<u64> = vec![&env];

        for i in 0..n {
            let (beneficiary, bps) = beneficiaries.get(i).unwrap();
            let share_amount = total_amount
                .checked_mul(bps as i128)
                .ok_or(ContractError::AmountOverflow)?
                / 10_000;

            // The first sub-lock reuses group_id so the group_id is also a
            // valid lock id; subsequent sub-locks get their own ids.
            let lock_id = if i == 0 { group_id } else { next_id(&env) };

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
            env.storage()
                .persistent()
                .set(&DataKey::UniquePoolShareCount, &(unique_count + 1));
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
        env.storage()
            .persistent()
            .set(&DataKey::GlobalLockCount, &(lock_count + n as u64));

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
            .expect("not initialised");
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

    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialised");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
    }

    pub fn propose_upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialised");
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
    }

    pub fn execute_upgrade(env: Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialised");
        admin.require_auth();
        let proposal: UpgradeProposal = env
            .storage()
            .instance()
            .get(&DataKey::UpgradeProposal)
            .expect("no pending upgrade");
        if env.ledger().timestamp() < proposal.execute_after {
            panic!("timelock not elapsed");
        }
        env.storage().instance().remove(&DataKey::UpgradeProposal);
        env.deployer()
            .update_current_contract_wasm(proposal.new_wasm_hash);
    }

    pub fn cancel_upgrade(env: Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialised");
        admin.require_auth();
        env.storage().instance().remove(&DataKey::UpgradeProposal);
        env.events()
            .publish((Symbol::new(&env, "upgrade_cancelled"),), ());
    }
}
