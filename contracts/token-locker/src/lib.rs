#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, vec,
    Address, Env, Vec, Symbol,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Lock(u64),
    NextId,
    ByCreator(Address),
    ByBeneficiary(Address),
    ByToken(Address),
}

// ── Error types ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ContractError {
    AmountMustBePositive = 1,
    UnlockMustBeFuture   = 2,
    AlreadyWithdrawn     = 3,
    StillLocked          = 4,
    NothingToRelease     = 5,
    CanOnlyExtend        = 6,
    VestingEndBeforeStart = 7,
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
    id
}

fn push_index(env: &Env, key: DataKey, id: u64) {
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(vec![env]);
    ids.push_back(id);
    env.storage().persistent().set(&key, &ids);
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
    env.storage().persistent().set(&DataKey::Lock(lock.id), lock);
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
        push_index(&env, DataKey::ByCreator(creator), id);
        push_index(&env, DataKey::ByBeneficiary(beneficiary), id);
        push_index(&env, DataKey::ByToken(token), id);

        env.events().publish((Symbol::new(&env, "lock_created"),), id);
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
        env.events().publish((Symbol::new(&env, "withdrawn"),), id);
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

        lock.unlock_at = new_unlock_at;
        lock.extended_count += 1;

        save_lock(&env, &lock);
        env.events().publish((Symbol::new(&env, "extended"),), id);
        Ok(())
    }

    /// Transfer the beneficiary role to a new address. Current beneficiary only.
    pub fn transfer_beneficiary(env: Env, id: u64, new_beneficiary: Address) -> Result<(), ContractError> {
        let mut lock = load_lock(&env, id);
        lock.beneficiary.require_auth();

        if lock.withdrawn {
            return Err(ContractError::AlreadyWithdrawn);
        }

        remove_from_index(&env, DataKey::ByBeneficiary(lock.beneficiary.clone()), id);
        push_index(&env, DataKey::ByBeneficiary(new_beneficiary.clone()), id);

        lock.beneficiary = new_beneficiary;
        save_lock(&env, &lock);

        env.events().publish((Symbol::new(&env, "beneficiary_transferred"),), id);
        Ok(())
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
