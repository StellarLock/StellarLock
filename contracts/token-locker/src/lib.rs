#![cfg_attr(not(test), no_std)]
// Soroban contract entry points (create_lock) take a fixed set of ABI
// arguments plus the `Env`, so `too_many_arguments` is not actionable here.
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, vec, Address, BytesN, Env, String,
    Symbol, Vec,
};

#[cfg(test)]
mod prop_tests;
#[cfg(test)]
mod tests;

// ── TTL constants ─────────────────────────────────────────────────────────────
const LEDGERS_PER_DAY: u32 = 17_280;
const PERSISTENT_BUMP: u32 = 365 * LEDGERS_PER_DAY;
const PERSISTENT_THRESHOLD: u32 = PERSISTENT_BUMP;
const INSTANCE_BUMP: u32 = 30 * LEDGERS_PER_DAY;
const INSTANCE_THRESHOLD: u32 = 7 * LEDGERS_PER_DAY;
// Withdrawn locks get a short TTL — enough to be queried but not renewed forever (~11.6× cheaper).
const WITHDRAWN_BUMP: u32 = 30 * LEDGERS_PER_DAY;
const WITHDRAWN_THRESHOLD: u32 = 7 * LEDGERS_PER_DAY;

// ── Rate limiting ─────────────────────────────────────────────────────────────
const RATE_LIMIT_COOLDOWN: u64 = 60;
const RATE_LIMIT_TTL_LEDGERS: u32 = 720;

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
    Admin,
    PendingAdmin,
    UpgradeProposal,
    ReentrancyGuard,
}

// 7-day timelock before an upgrade can be executed.
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
    NothingToRelease = 5,
    CanOnlyExtend = 6,
    VestingEndBeforeStart = 7,
    TooFewBeneficiaries = 8,
    TooManyBeneficiaries = 9,
    SharesMustSum10000 = 10,
    RateLimitExceeded = 11,
    AmountOverflow = 12,
    NotAdmin = 15,
    NoPendingAdmin = 13,
    NotPendingAdmin = 14,
    NotInitialized = 16,
    TimelockNotElapsed = 17,
    NoPendingUpgrade = 18,
    ReentrancyDetected = 16,
    LockNotFound = 17,
}

// ── On-chain types ────────────────────────────────────────────────────────────

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

    /// Sentinel for lock-creation paths that don't (yet) accept metadata, e.g. split locks.
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
    pub vesting: Vesting,
    pub metadata: LockMetadata,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn next_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(1000);
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

fn load_lock(env: &Env, id: u64) -> Result<Lock, ContractError> {
    env.storage()
        .persistent()
        .get(&DataKey::Lock(id))
        .ok_or(ContractError::LockNotFound)
}

fn save_lock(env: &Env, lock: &Lock) {
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

fn collect_locks_paginated(env: &Env, ids: Vec<u64>, offset: u32, limit: u32) -> Vec<Lock> {
    let mut out: Vec<Lock> = vec![env];
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
pub struct TokenLocker;

#[contractimpl]
impl TokenLocker {
    pub fn create_lock(
        env: Env,
        creator: Address,
        token: Address,
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
            vesting: vesting.unwrap_or_else(Vesting::none),
            metadata,
        };

        save_lock(&env, &lock);

        // Register indices
        push_index(&env, DataKey::ByCreator(creator.clone()), id, false);
        push_index(&env, DataKey::ByBeneficiary(beneficiary.clone()), id, false);
        push_index(&env, DataKey::ByToken(token.clone()), id, false);

        // Update TVL and global stats
        let current_tvl: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalLocked(token.clone()))
            .unwrap_or(0);
        let new_tvl = current_tvl
            .checked_add(amount)
            .ok_or(ContractError::AmountOverflow)?;
        if current_tvl == 0 {
            let unique_count: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::UniqueTokenCount)
                .unwrap_or(0);
            let new_unique_count = unique_count
                .checked_add(1)
                .ok_or(ContractError::AmountOverflow)?;
            env.storage()
                .persistent()
                .set(&DataKey::UniqueTokenCount, &new_unique_count);
        }
        env.storage()
            .persistent()
            .set(&DataKey::TotalLocked(token.clone()), &new_tvl);
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

        env.storage().temporary().set(&rate_key, &now);
        env.storage().temporary().extend_ttl(
            &rate_key,
            RATE_LIMIT_TTL_LEDGERS,
            RATE_LIMIT_TTL_LEDGERS,
        );

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

            token::Client::new(&env, &lock.token).transfer(
                &env.current_contract_address(),
                &lock.beneficiary,
                &releasable,
            );

            let current_tvl: i128 = env
                .storage()
                .persistent()
                .get(&DataKey::TotalLocked(lock.token.clone()))
                .unwrap_or(0);
            let new_tvl = (current_tvl - releasable).max(0);
            env.storage()
                .persistent()
                .set(&DataKey::TotalLocked(lock.token.clone()), &new_tvl);

            let fully_withdrawn = lock.vesting.is_none() || lock.vesting.released >= lock.amount;
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
        })();
        exit_guard(&env);
        result
    }

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
        })();
        exit_guard(&env);
        result
    }

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
                (
                    Symbol::new(&env, "beneficiary_transferred"),
                    id,
                    old_beneficiary,
                    new_beneficiary,
                ),
                (),
            );
            Ok(())
        })();
        exit_guard(&env);
        result
    }

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

    pub fn get_lock(env: Env, id: u64) -> Option<Lock> {
        env.storage().persistent().get(&DataKey::Lock(id))
    }

    pub fn get_locks_by_creator(env: Env, creator: Address, offset: u32, limit: u32) -> Vec<Lock> {
        collect_locks_paginated(
            &env,
            get_index(&env, DataKey::ByCreator(creator)),
            offset,
            limit,
        )
    }

    pub fn get_locks_by_beneficiary(
        env: Env,
        beneficiary: Address,
        offset: u32,
        limit: u32,
    ) -> Vec<Lock> {
        collect_locks_paginated(
            &env,
            get_index(&env, DataKey::ByBeneficiary(beneficiary)),
            offset,
            limit,
        )
    }

    pub fn get_locks_by_token(env: Env, token: Address, offset: u32, limit: u32) -> Vec<Lock> {
        collect_locks_paginated(
            &env,
            get_index(&env, DataKey::ByToken(token)),
            offset,
            limit,
        )
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

        token::Client::new(&env, &token).transfer(
            &creator,
            &env.current_contract_address(),
            &total_amount,
        );

        let group_id = next_id(&env);
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
            push_index(&env, DataKey::ByToken(token.clone()), lock_id, false);
            lock_ids.push_back(lock_id);

            // Each split-group child is a fully independent Lock (its own id,
            // later withdrawable — and re-extendable, re-transferable — via
            // the standard entry points), so it gets its own `lock_created`
            // event with its own beneficiary/amount, exactly like a regular
            // lock. This lets indexers track every child individually instead
            // of collapsing the group into a single row keyed by group id.
            env.events().publish(
                (
                    Symbol::new(&env, "lock_created"),
                    lock_id,
                    creator.clone(),
                    token.clone(),
                    share_amount,
                    beneficiary.clone(),
                    unlock_at,
                ),
                (),
            );
        }

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

        // Group-level summary only — each child's own state was already
        // published above via its individual `lock_created` event.
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

    pub fn get_total_locked(env: Env, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalLocked(token))
            .unwrap_or(0)
    }

    pub fn get_global_stats(env: Env) -> GlobalStats {
        let total_lock_count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::GlobalLockCount)
            .unwrap_or(0);
        let unique_token_count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::UniqueTokenCount)
            .unwrap_or(0);
        GlobalStats {
            total_lock_count,
            unique_token_count,
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
    /// Panics if admin is already set.
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

    /// Admin proposes a WASM upgrade. Executable only after 7 days.
    pub fn propose_upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), ContractError> {
    pub fn propose_upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        admin.require_auth();
        let execute_after = env.ledger().timestamp() + UPGRADE_DELAY;
        let proposal = UpgradeProposal { new_wasm_hash, execute_after };
        env.storage().instance().set(&DataKey::UpgradeProposal, &proposal);
        env.storage().instance().extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
        env.events().publish(
            (Symbol::new(&env, "upgrade_proposed"), execute_after),
            (),
        );
        Ok(())
    }

    /// Execute a previously proposed upgrade after the timelock has elapsed.
    pub fn execute_upgrade(env: Env) -> Result<(), ContractError> {
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

    /// Execute a previously proposed upgrade after the timelock has elapsed.
    pub fn execute_upgrade(env: Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
            .expect("not initialised");
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
        env.deployer().update_current_contract_wasm(proposal.new_wasm_hash);
        Ok(())
    }

    /// Cancel a pending upgrade. Admin only.
    pub fn cancel_upgrade(env: Env) -> Result<(), ContractError> {
        env.deployer()
            .update_current_contract_wasm(proposal.new_wasm_hash);
    }

    /// Cancel a pending upgrade. Admin only.
    pub fn cancel_upgrade(env: Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ContractError::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().remove(&DataKey::UpgradeProposal);
        env.events().publish((Symbol::new(&env, "upgrade_cancelled"),), ());
        Ok(())
            .expect("not initialised");
        admin.require_auth();
        env.storage().instance().remove(&DataKey::UpgradeProposal);
        env.events()
            .publish((Symbol::new(&env, "upgrade_cancelled"),), ());
    }
}
