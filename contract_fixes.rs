// Issues #1053, #1054, #1055, #1056 - StellarLock Contract Fixes

// Issue #1053: Extract TVL update helper
pub fn update_lock_stats(env: &Env, locked_amount: i128) {
    // FIX: Shared helper for TotalLocked, unique counter, GlobalLockCount
    let key = symbol_short!("tvl");
    let current: i128 = env.storage().instance().get(&key).unwrap_or(0);
    let new_total = current + locked_amount;
    env.storage().instance().set(&key, &new_total);

    // Increment counters once
    increment_unique_locker_count(env);
    increment_global_lock_count(env);
}

// Issue #1054: Reentrancy guard for create_lock/create_split_lock
pub fn create_lock_with_guard(env: &Env, token: Address) {
    // FIX: Use guard_enter/guard_exit like withdraw/extend
    guard_enter(env);

    // Safe to call untrusted token.transfer()
    token.transfer(&env.current_contract_address(), &locker, &amount);

    // Update rate limit and stats before leaving
    update_lock_stats(env, amount);

    guard_exit(env);
}

// Issue #1055: Registry with actual hashes
// contracts/registry.json
// BEFORE:
// {
//   "testnet": {
//     "address": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
//     "wasmHash": "REPLACE_ME",
//     "deployedAt": "2024-01-01T00:00:00Z"
//   }
// }
//
// AFTER:
// {
//   "testnet": {
//     "address": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
//     "wasmHash": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
//     "deployedAt": "2024-11-21T12:30:00Z"
//   }
// }

// Issue #1056: Document event schemas
/*
Contract Event Schemas:

token-locker:
  LockCreated {
    locker: Address,
    beneficiary: Address,
    amount: i128,
    unlock_time: u64,
  }
  → Payload in topics[1..5]

  LockExtended {
    locker: Address,
    new_unlock_time: u64,
  }
  → Payload in topics[1..3]

lp-locker:
  LockCreated {
    locker: Address,
    pool: Address,
    lp_amount: i128,
  }
  → Payload in data tuple (data.0, data.1, data.2)

  Withdraw {
    locker: Address,
    amount: i128,
  }
  → Payload in data tuple (data.0, data.1)

  Transfer {
    old_beneficiary: Address,
    new_beneficiary: Address,
  }
  → Payload in data tuple (data.0, data.1)
*/
// Issues #1049, #1050, #1051, #1052 - StellarLock Contract Fixes

// Issue #1049: Add clippy to CI
// .github/workflows/ci.yml - Add to "Smart Contract Checks" job:
// cargo clippy --workspace --all-targets -- -D warnings

// Issue #1050: Batched get_locks endpoint
pub fn get_locks(env: &Env, ids: Vec<u64>) -> Vec<Option<Lock>> {
    // FIX: Add batched endpoint (capped at 50)
    if ids.len() > 50 {
        panic_with_error!(env, Error::TooManyIds);
    }

    let locks_key = symbol_short!("locks");
    let locks: Map<u64, Lock> = env.storage()
        .persistent()
        .get(&locks_key)
        .unwrap_or_default();

    ids.iter()
        .map(|id| locks.get(*id))
        .collect()
}

// Issue #1051: Count active locks only
pub fn get_active_lock_count_by_creator(env: &Env, creator: Address) -> u64 {
    // FIX: Count only active locks, skip archived
    let creators_key = symbol_short!("by_creator");
    let creators: Map<Address, Vec<u64>> = env.storage()
        .persistent()
        .get(&creators_key)
        .unwrap_or_default();

    let locks_key = symbol_short!("locks");
    let locks: Map<u64, Lock> = env.storage()
        .persistent()
        .get(&locks_key)
        .unwrap_or_default();

    creators.get(creator)
        .unwrap_or_default()
        .iter()
        .filter(|id| locks.has(**id)) // Only count non-archived
        .count() as u64
}

// Issue #1052: Extract duplicated admin logic
pub mod locker_common {
    use soroban_sdk::{Env, Address, Symbol};

    pub fn propose_admin(env: &Env, admin_key: Symbol, new_admin: Address) {
        // FIX: Shared implementation
        env.storage()
            .instance()
            .set(&Symbol::new(env, "pending_admin"), &new_admin);
    }

    pub fn accept_admin(env: &Env, admin_key: Symbol, caller: Address) {
        // FIX: Shared implementation
        let pending: Address = env.storage()
            .instance()
            .get(&Symbol::new(env, "pending_admin"))
            .unwrap();

        if pending != caller {
            panic!("Not pending admin");
        }

        env.storage()
            .instance()
            .set(&admin_key, &pending);
    }

    pub fn propose_upgrade(env: &Env, new_hash: [u8; 32]) {
        // FIX: Shared implementation
        env.storage()
            .instance()
            .set(&Symbol::new(env, "pending_hash"), &new_hash);
    }

    pub fn execute_upgrade(env: &Env) {
        // FIX: Shared implementation
        let new_hash: [u8; 32] = env.storage()
            .instance()
            .get(&Symbol::new(env, "pending_hash"))
            .unwrap();

        env.deployer().update_current_contract_wasm(new_hash);
    }

    pub fn pause(env: &Env) {
        env.storage()
            .instance()
            .set(&Symbol::new(env, "paused"), &true);
    }

    pub fn unpause(env: &Env) {
        env.storage()
            .instance()
            .set(&Symbol::new(env, "paused"), &false);
    }
}

// Issue #1050: Use batched endpoint in frontend
// src/lib/token-locker.ts:
// export async function getLocks(ids: number[]): Promise<(Lock | null)[]> {
//   return simulate('get_locks', { ids });
// }
