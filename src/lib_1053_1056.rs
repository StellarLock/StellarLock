// Issue #1053: Extract TVL/counter update into shared helper
// Replaces 4 copies of ~35 lines in create_lock and create_split_lock

use soroban_sdk::{Env, Address, Symbol, symbol_short};

pub fn update_tvl_and_counters(env: &Env, locked_amount: i128) {
    // FIX: Single source of truth for TVL update

    // 1. Update TotalLocked
    let tvl_key = symbol_short!("tvl");
    let current_tvl: i128 = env.storage()
        .persistent()
        .get(&tvl_key)
        .unwrap_or_default();

    let new_tvl = current_tvl.checked_add(locked_amount)
        .expect("TVL overflow");

    env.storage()
        .persistent()
        .set(&tvl_key, &new_tvl);

    // 2. Increment unique locker count (once per new locker)
    increment_unique_locker_count(env);

    // 3. Increment global lock count (once per lock)
    increment_global_lock_count(env);
}

fn increment_unique_locker_count(env: &Env) {
    let key = symbol_short!("uniq");
    let count: u64 = env.storage()
        .persistent()
        .get(&key)
        .unwrap_or(0);

    env.storage()
        .persistent()
        .set(&key, &(count + 1));
}

fn increment_global_lock_count(env: &Env) {
    let key = symbol_short!("locks");
    let count: u64 = env.storage()
        .persistent()
        .get(&key)
        .unwrap_or(0);

    env.storage()
        .persistent()
        .set(&key, &(count + 1));
}

// Issue #1056: Document event schemas
/*
EVENT SCHEMA DOCUMENTATION

token-locker:
  LockCreated(locker: Address, beneficiary: Address, amount: i128, unlock_time: u64)
  - EVENT TYPE: ContractEvent::ExtensionPoint
  - TOPICS: [locker, beneficiary]
  - DATA: (amount: i128, unlock_time: u64)
  - HOW TO PARSE: Read amount and unlock_time from data tuple

  LockExtended(locker: Address, new_unlock_time: u64)
  - EVENT TYPE: ContractEvent::ExtensionPoint
  - TOPICS: [locker, new_unlock_time]
  - DATA: Empty
  - HOW TO PARSE: Read locker and new_unlock_time from topics

  Withdrawn(locker: Address, amount: i128)
  - EVENT TYPE: ContractEvent::ExtensionPoint
  - TOPICS: [locker]
  - DATA: (amount: i128)
  - HOW TO PARSE: Read locker from topics[0], amount from data

  TransferBeneficiary(old: Address, new: Address)
  - EVENT TYPE: ContractEvent::ExtensionPoint
  - TOPICS: [old, new]
  - DATA: Empty
  - HOW TO PARSE: Read addresses from topics

lp-locker:
  LockCreated(locker: Address, pool: Address, lp_amount: i128)
  - EVENT TYPE: ContractEvent::ExtensionPoint
  - TOPICS: [locker, pool]
  - DATA: (lp_amount: i128)
  - HOW TO PARSE: locker and pool from topics, lp_amount from data[0]

  Withdrawn(locker: Address, lp_amount: i128)
  - EVENT TYPE: ContractEvent::ExtensionPoint
  - TOPICS: [locker]
  - DATA: (lp_amount: i128)
  - HOW TO PARSE: locker from topics[0], lp_amount from data[0]

  Extended(locker: Address, new_unlock_time: u64)
  - EVENT TYPE: ContractEvent::ExtensionPoint
  - TOPICS: [locker]
  - DATA: (new_unlock_time: u64)
  - HOW TO PARSE: locker from topics[0], time from data[0]

  TransferBeneficiary(old: Address, new: Address)
  - EVENT TYPE: ContractEvent::ExtensionPoint
  - TOPICS: [old, new]
  - DATA: Empty
  - HOW TO PARSE: Addresses from topics

INDEXER INTEGRATION:
- For token-locker events: check topics.len() to determine event type
- For lp-locker events: same pattern
- Always fallback to data tuple if topics are insufficient
- Timestamps are u64 (Ledger close time)
- Amounts are i128 (can be negative in theoretical cases)
*/
