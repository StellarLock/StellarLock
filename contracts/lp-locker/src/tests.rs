#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

use crate::{ContractError, Dex, LpLocker, LpLockerClient};

// ── Test setup ────────────────────────────────────────────────────────────────

fn setup_env() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(LpLocker, ());

    let admin = Address::generate(&env);
    let pool_share_id = env.register_stellar_asset_contract_v2(admin.clone()).address();

    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    (env, contract_id, pool_share_id, token_a, token_b)
}

fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
    token::StellarAssetClient::new(env, token_id).mint(to, &amount);
}

fn advance_time(env: &Env, seconds: u64) {
    let current = env.ledger().timestamp();
    env.ledger().with_mut(|l| l.timestamp = current + seconds);
}

// ── Basic validity tests ──────────────────────────────────────────────────────

#[test]
fn create_lp_lock_valid_inputs() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &500_i128, &beneficiary, &unlock_at);

    let lock = client.get_lock(&lock_id).expect("lock exists");
    assert_eq!(lock.amount, 500_i128);
    assert_eq!(lock.creator, creator);
    assert_eq!(lock.beneficiary, beneficiary);
    assert_eq!(lock.unlock_at, unlock_at);
    assert!(!lock.withdrawn);
}

#[test]
fn create_lp_lock_rejects_zero_amount() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);

    let unlock_at = env.ledger().timestamp() + 100;
    let result = client.try_create_lock(
        &creator, &pool_share_id, &Dex::Aquarius, &token_a, &token_b, &0_i128, &beneficiary, &unlock_at,
    );
    assert_eq!(result, Err(Ok(ContractError::AmountMustBePositive)));
}

#[test]
fn create_lp_lock_rejects_past_unlock() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);

    let result = client.try_create_lock(
        &creator, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &100_i128, &beneficiary, &0_u64,
    );
    assert_eq!(result, Err(Ok(ContractError::UnlockMustBeFuture)));
}

// ── Multi-account: withdraw authorization ─────────────────────────────────────

#[test]
fn beneficiary_can_withdraw_after_unlock() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &500_i128, &beneficiary, &unlock_at);

    advance_time(&env, 200);
    client.withdraw(&lock_id);

    assert!(client.get_lock(&lock_id).unwrap().withdrawn);
}

#[test]
fn withdraw_fails_before_unlock_at() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 1000;
    let lock_id = client
        .create_lock(&creator, &pool_share_id, &Dex::Aquarius, &token_a, &token_b, &100_i128, &beneficiary, &unlock_at);

    let result = client.try_withdraw(&lock_id);
    assert_eq!(result, Err(Ok(ContractError::StillLocked)));
}

#[test]
fn withdraw_twice_is_rejected() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &100_i128, &beneficiary, &unlock_at);

    advance_time(&env, 200);
    client.withdraw(&lock_id);

    let result = client.try_withdraw(&lock_id);
    assert_eq!(result, Err(Ok(ContractError::AlreadyWithdrawn)));
}

// ── Multi-account: extend authorization ──────────────────────────────────────

#[test]
fn creator_can_extend_lp_lock() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &pool_share_id, &Dex::Aquarius, &token_a, &token_b, &100_i128, &beneficiary, &unlock_at);

    let new_unlock = unlock_at + 500;
    client.extend(&lock_id, &new_unlock);

    let lock = client.get_lock(&lock_id).unwrap();
    assert_eq!(lock.unlock_at, new_unlock);
    assert_eq!(lock.extended_count, 1);
}

#[test]
fn extend_cannot_decrease_unlock_time() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 1000;
    let lock_id = client
        .create_lock(&creator, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &100_i128, &beneficiary, &unlock_at);

    let result = client.try_extend(&lock_id, &(unlock_at - 1));
    assert_eq!(result, Err(Ok(ContractError::CanOnlyExtend)));
}

#[test]
fn extend_after_withdrawal_fails() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &100_i128, &beneficiary, &unlock_at);

    advance_time(&env, 200);
    client.withdraw(&lock_id);

    let result = client.try_extend(&lock_id, &(unlock_at + 1000));
    assert_eq!(result, Err(Ok(ContractError::AlreadyWithdrawn)));
}

// ── Multi-account: beneficiary transfer flow ──────────────────────────────────

#[test]
fn transfer_beneficiary_and_new_beneficiary_can_withdraw() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let original_beneficiary = Address::generate(&env);
    let new_beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &300_i128, &original_beneficiary, &unlock_at);

    client.transfer_beneficiary(&lock_id, &new_beneficiary);

    let lock = client.get_lock(&lock_id).unwrap();
    assert_eq!(lock.beneficiary, new_beneficiary);

    advance_time(&env, 200);
    client.withdraw(&lock_id);

    assert!(client.get_lock(&lock_id).unwrap().withdrawn);
}

#[test]
fn transfer_beneficiary_updates_indexes() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let original_beneficiary = Address::generate(&env);
    let new_beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &pool_share_id, &Dex::Aquarius, &token_a, &token_b, &100_i128, &original_beneficiary, &unlock_at);

    client.transfer_beneficiary(&lock_id, &new_beneficiary);

    assert_eq!(client.get_locks_by_beneficiary(&original_beneficiary, &0, &10).len(), 0);
    let new_locks = client.get_locks_by_beneficiary(&new_beneficiary, &0, &10);
    assert_eq!(new_locks.len(), 1);
    assert_eq!(new_locks.get(0).unwrap().id, lock_id);
}

// ── Creator / beneficiary index query tests ───────────────────────────────────

#[test]
fn get_locks_by_creator_returns_correct_locks() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator_a = Address::generate(&env);
    let creator_b = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator_a, 5_000);
    mint(&env, &pool_share_id, &creator_b, 5_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let id1 = client
        .create_lock(&creator_a, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &100_i128, &beneficiary, &unlock_at);
    let id2 = client
        .create_lock(&creator_a, &pool_share_id, &Dex::Aquarius, &token_a, &token_b, &200_i128, &beneficiary, &unlock_at);
    client
        .create_lock(&creator_b, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &300_i128, &beneficiary, &unlock_at);

    let locks_a = client.get_locks_by_creator(&creator_a, &0, &10);
    assert_eq!(locks_a.len(), 2);
    let ids: soroban_sdk::Vec<u64> = {
        let mut v = soroban_sdk::vec![&env];
        for l in locks_a.iter() { v.push_back(l.id); }
        v
    };
    assert!(ids.contains(&id1));
    assert!(ids.contains(&id2));

    assert_eq!(client.get_locks_by_creator(&creator_b, &0, &10).len(), 1);
}

// ── ByPoolShare index tests ───────────────────────────────────────────────────

#[test]
fn get_locks_by_pool_share_works() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 5_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let id1 = client
        .create_lock(&creator, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &200_i128, &beneficiary, &unlock_at);
    let id2 = client
        .create_lock(&creator, &pool_share_id, &Dex::Aquarius, &token_a, &token_b, &300_i128, &beneficiary, &unlock_at);

    let locks = client.get_locks_by_pool_share(&pool_share_id, &0, &10);
    assert_eq!(locks.len(), 2);

    let ids: soroban_sdk::Vec<u64> = {
        let mut v = soroban_sdk::vec![&env];
        for l in locks.iter() { v.push_back(l.id); }
        v
    };
    assert!(ids.contains(&id1));
    assert!(ids.contains(&id2));
}

#[test]
fn different_pool_shares_have_isolated_indexes() {
    let (env, contract_id, pool_share_a, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let admin2 = Address::generate(&env);
    let pool_share_b = env.register_stellar_asset_contract_v2(admin2).address();

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_a, &creator, 5_000);
    mint(&env, &pool_share_b, &creator, 5_000);

    let unlock_at = env.ledger().timestamp() + 100;
    client.create_lock(&creator, &pool_share_a, &Dex::Soroswap, &token_a, &token_b, &100_i128, &beneficiary, &unlock_at);
    client.create_lock(&creator, &pool_share_b, &Dex::Aquarius, &token_a, &token_b, &200_i128, &beneficiary, &unlock_at);

    assert_eq!(client.get_lock_count_by_pool_share(&pool_share_a), 1);
    assert_eq!(client.get_lock_count_by_pool_share(&pool_share_b), 1);
}

// ── TVL / global stats ────────────────────────────────────────────────────────

#[test]
fn lp_tvl_increases_on_create_decreases_on_withdraw() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 5_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id_1 = client
        .create_lock(&creator, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &400_i128, &beneficiary, &unlock_at);
    client
        .create_lock(&creator, &pool_share_id, &Dex::Aquarius, &token_a, &token_b, &600_i128, &beneficiary, &unlock_at);

    assert_eq!(client.get_total_locked(&pool_share_id), 1_000_i128);

    let stats = client.get_global_stats();
    assert_eq!(stats.total_lock_count, 2);
    assert_eq!(stats.unique_pool_share_count, 1);

    advance_time(&env, 200);
    client.withdraw(&lock_id_1);

    assert_eq!(client.get_total_locked(&pool_share_id), 600_i128);
}

#[test]
fn lp_global_stats_counts_unique_pool_shares() {
    let (env, contract_id, pool_share_a, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let admin2 = Address::generate(&env);
    let pool_share_b = env.register_stellar_asset_contract_v2(admin2).address();

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &pool_share_a, &creator, 5_000);
    mint(&env, &pool_share_b, &creator, 5_000);

    let unlock_at = env.ledger().timestamp() + 100;
    client.create_lock(&creator, &pool_share_a, &Dex::Soroswap, &token_a, &token_b, &100_i128, &beneficiary, &unlock_at);
    client.create_lock(&creator, &pool_share_b, &Dex::Aquarius, &token_a, &token_b, &200_i128, &beneficiary, &unlock_at);

    let stats = client.get_global_stats();
    assert_eq!(stats.total_lock_count, 2);
    assert_eq!(stats.unique_pool_share_count, 2);
}

// ── Cross-account query isolation ─────────────────────────────────────────────

#[test]
fn three_accounts_full_lp_flow() {
    let (env, contract_id, pool_share_id, token_a, token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    mint(&env, &pool_share_id, &creator, 5_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &pool_share_id, &Dex::Soroswap, &token_a, &token_b, &1_000_i128, &beneficiary, &unlock_at);

    assert_eq!(client.get_lock_count_by_creator(&unauthorized), 0);
    assert_eq!(client.get_lock_count_by_beneficiary(&unauthorized), 0);
    assert_eq!(client.get_lock_count_by_creator(&creator), 1);
    assert_eq!(client.get_lock_count_by_beneficiary(&beneficiary), 1);

    client.extend(&lock_id, &(unlock_at + 500));
    advance_time(&env, 700);
    client.withdraw(&lock_id);

    assert!(client.get_lock(&lock_id).unwrap().withdrawn);
}

// ── Admin management ──────────────────────────────────────────────────────────

#[test]
fn get_admin_returns_none_before_init() {
    let (env, contract_id, _pool_share_id, _token_a, _token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    assert!(client.get_admin().is_none());
}

#[test]
fn get_admin_returns_admin_after_init() {
    let (env, contract_id, _pool_share_id, _token_a, _token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.init(&admin);

    assert_eq!(client.get_admin(), Some(admin));
}

#[test]
fn propose_and_accept_admin_transfers_ownership() {
    let (env, contract_id, _pool_share_id, _token_a, _token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    client.init(&admin);

    // Step 1: current admin proposes new admin
    client.propose_admin(&new_admin).unwrap();

    // Admin has not changed yet
    assert_eq!(client.get_admin(), Some(admin.clone()));

    // Step 2: new admin accepts
    client.accept_admin().unwrap();

    // Admin is now the new address
    assert_eq!(client.get_admin(), Some(new_admin));
}

#[test]
fn accept_admin_fails_when_no_pending_admin() {
    let (env, contract_id, _pool_share_id, _token_a, _token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.init(&admin);

    let result = client.try_accept_admin();
    assert_eq!(result, Err(Ok(ContractError::NoPendingAdmin)));
}

#[test]
fn admin_transfer_is_idempotent_on_re_propose() {
    let (env, contract_id, _pool_share_id, _token_a, _token_b) = setup_env();
    let client = LpLockerClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let candidate_a = Address::generate(&env);
    let candidate_b = Address::generate(&env);
    client.init(&admin);

    // Propose A, then change mind and propose B before B accepts
    client.propose_admin(&candidate_a).unwrap();
    client.propose_admin(&candidate_b).unwrap();

    // Accepting should transfer to B, not A
    client.accept_admin().unwrap();
    assert_eq!(client.get_admin(), Some(candidate_b));
}

#[test]
fn propose_admin_requires_current_admin_auth() {
    let env = Env::default();
    // Do NOT call mock_all_auths — test real auth enforcement
    let contract_id = env.register(LpLocker, ());
    let client = LpLockerClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);

    // init with admin auth
    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &admin,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &contract_id,
            fn_name: "init",
            args: soroban_sdk::vec![&env, admin.clone().into()],
            sub_invokes: &[],
        },
    }]);
    client.init(&admin);

    // propose_admin without admin's authorisation must panic
    let result = std::panic::catch_unwind(|| {
        let env2 = env.clone();
        let c2 = LpLockerClient::new(&env2, &contract_id);
        c2.propose_admin(&new_admin)
    });
    assert!(result.is_err(), "propose_admin without auth must panic");
}
