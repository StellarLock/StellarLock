#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, vec,
    Address, Env, Vec, Symbol,
};

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
    LastLockAt(Address),
}

// ── Error types ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ContractError {
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
        push_index(&env, DataKey::ByBeneficiary(beneficiary), id);
        push_index(&env, DataKey::ByToken(token), id);

        // Record the timestamp of this lock creation for rate-limiting future calls.
        env.storage().temporary().set(&rate_key, &now);
        env.storage().temporary().extend_ttl(&rate_key, RATE_LIMIT_TTL_LEDGERS, RATE_LIMIT_TTL_LEDGERS);

        env.events().publish(
            (
                Symbol::new(&env, "lock_created"),
                id,
                creator.clone(),
                token.clone(),
                amount,
                beneficiary.clone(),
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
            let elapsed = now.saturating_sub(v.start) as i128;
            let duration = v.end.saturating_sub(v.start) as i128;
            let vested = if duration == 0 {
                lock.amount
            } else {
                (lock.amount * elapsed / duration).min(lock.amount)
            };
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
}
