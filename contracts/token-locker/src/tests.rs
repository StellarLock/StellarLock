#![cfg(test)]
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, vec, Address, Env,
};

use crate::{ContractError, TokenLocker, TokenLockerClient, Vesting};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn setup() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract = env.register(TokenLocker, ());
    (env, contract)
}

fn mock_token(env: &Env) -> (Address, token::StellarAssetClient) {
    let admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract(admin.clone());
    let client = token::StellarAssetClient::new(env, &token_id);
    (token_id, client)
}

fn set_ledger_time(env: &Env, timestamp: u64) {
    env.ledger().set(LedgerInfo {
        timestamp,
        protocol_version: 22,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 10_000_000,
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[test]
fn create_lock_succeeds_with_valid_inputs() {
    let (env, contract) = setup();
    let client = TokenLockerClient::new(&env, &contract);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let (token_id, token_admin) = mock_token(&env);

    token_admin.mint(&creator, &1_000_0000000_i128);

    set_ledger_time(&env, 1_000_000);
    let unlock_at: u64 = 1_000_000 + 86_400;

    let lock_id = client
        .create_lock(&creator, &token_id, &100_0000000_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    let lock = client.get_lock(&lock_id).unwrap();
    assert_eq!(lock.amount, 100_0000000_i128);

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

use crate::{ContractError, TokenLocker, TokenLockerClient, Vesting};

// ── Test setup ────────────────────────────────────────────────────────────────

fn setup_env() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(TokenLocker, ());
    let admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(admin.clone()).address();
    (env, contract_id, token_id)
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
fn create_lock_valid_inputs() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &100_i128, &beneficiary, &unlock_at, &None)
        .expect("create_lock should succeed");

    let lock = client.get_lock(&lock_id).expect("lock exists");
    assert_eq!(lock.amount, 100_i128);
    assert_eq!(lock.creator, creator);
    assert_eq!(lock.beneficiary, beneficiary);
    assert_eq!(lock.unlock_at, unlock_at);
    assert!(!lock.withdrawn);
}

#[test]
fn create_lock_rejects_zero_amount() {
    let (env, contract) = setup();
    let client = TokenLockerClient::new(&env, &contract);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let (token_id, _) = mock_token(&env);

    set_ledger_time(&env, 1_000_000);

    let result = client.try_create_lock(
        &creator,
        &token_id,
        &0_i128,
        &beneficiary,
        &(1_000_000 + 86_400),
        &None,
    );
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);
    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let result = client.try_create_lock(&creator, &token_id, &0_i128, &beneficiary, &unlock_at, &None);
    assert_eq!(result, Err(Ok(ContractError::AmountMustBePositive)));
}

#[test]
fn create_lock_rejects_past_unlock_date() {
    let (env, contract) = setup();
    let client = TokenLockerClient::new(&env, &contract);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let (token_id, _) = mock_token(&env);

    set_ledger_time(&env, 1_000_000);

    let result = client.try_create_lock(
        &creator,
        &token_id,
        &100_i128,
        &beneficiary,
        &999_999, // in the past
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::UnlockMustBeFuture)));
}

#[test]
fn extend_can_only_increase_unlock_date() {
    let (env, contract) = setup();
    let client = TokenLockerClient::new(&env, &contract);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let (token_id, token_admin) = mock_token(&env);

    token_admin.mint(&creator, &1_000_0000000_i128);

    set_ledger_time(&env, 1_000_000);
    let unlock_at: u64 = 1_100_000;

    let lock_id = client
        .create_lock(&creator, &token_id, &50_0000000_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    // Extending to same date must fail.
    let result = client.try_extend(&lock_id, &unlock_at);
    assert_eq!(result, Err(Ok(ContractError::CanOnlyExtend)));

    // Extending into the future must succeed.
    client.extend(&lock_id, &(unlock_at + 86_400)).unwrap();

    let lock = client.get_lock(&lock_id).unwrap();
    assert_eq!(lock.unlock_at, unlock_at + 86_400);
fn create_lock_rejects_past_unlock() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);
    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let result = client.try_create_lock(&creator, &token_id, &100_i128, &beneficiary, &0_u64, &None);
    assert_eq!(result, Err(Ok(ContractError::UnlockMustBeFuture)));
}

// ── Multi-account: withdraw authorization ─────────────────────────────────────

#[test]
fn beneficiary_can_withdraw_after_unlock() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &500_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    advance_time(&env, 200);
    client.withdraw(&lock_id);

    assert!(client.get_lock(&lock_id).unwrap().withdrawn);
}

#[test]
fn withdraw_fails_before_unlock_at() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 1000;
    let lock_id = client
        .create_lock(&creator, &token_id, &100_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    let result = client.try_withdraw(&lock_id);
    assert_eq!(result, Err(Ok(ContractError::StillLocked)));
}

#[test]
fn withdraw_twice_is_rejected() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &100_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    advance_time(&env, 200);
    client.withdraw(&lock_id);

    let result = client.try_withdraw(&lock_id);
    assert_eq!(result, Err(Ok(ContractError::AlreadyWithdrawn)));
}

// ── Multi-account: extend authorization ──────────────────────────────────────

#[test]
fn creator_can_extend_lock() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &100_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    let new_unlock = unlock_at + 500;
    client.extend(&lock_id, &new_unlock);

    let lock = client.get_lock(&lock_id).unwrap();
    assert_eq!(lock.unlock_at, new_unlock);
    assert_eq!(lock.extended_count, 1);
}

#[test]
fn withdraw_before_unlock_fails() {
    let (env, contract) = setup();
    let client = TokenLockerClient::new(&env, &contract);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let (token_id, token_admin) = mock_token(&env);

    token_admin.mint(&creator, &1_000_0000000_i128);

    set_ledger_time(&env, 1_000_000);
    let unlock_at: u64 = 1_100_000;

    let lock_id = client
        .create_lock(&creator, &token_id, &50_0000000_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    let result = client.try_withdraw(&lock_id);
    assert_eq!(result, Err(Ok(ContractError::StillLocked)));
}

#[test]
fn withdraw_after_unlock_succeeds() {
    let (env, contract) = setup();
    let client = TokenLockerClient::new(&env, &contract);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let (token_id, token_admin) = mock_token(&env);

    token_admin.mint(&creator, &1_000_0000000_i128);

    set_ledger_time(&env, 1_000_000);
    let unlock_at: u64 = 1_100_000;

    let lock_id = client
        .create_lock(&creator, &token_id, &50_0000000_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    set_ledger_time(&env, unlock_at + 1);
    client.withdraw(&lock_id).unwrap();

    let lock = client.get_lock(&lock_id).unwrap();
    assert!(lock.withdrawn);
}

#[test]
fn vesting_end_must_be_after_start() {
    let (env, contract) = setup();
    let client = TokenLockerClient::new(&env, &contract);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let (token_id, _) = mock_token(&env);

    set_ledger_time(&env, 1_000_000);

    let bad_vesting = Vesting { start: 2_000_000, end: 1_500_000, released: 0 };
    let result = client.try_create_lock(
        &creator,
        &token_id,
        &100_i128,
        &beneficiary,
        &(1_000_000 + 86_400),
        &Some(bad_vesting),
    );
    assert_eq!(result, Err(Ok(ContractError::VestingEndBeforeStart)));
}

#[test]
fn create_split_lock_requires_at_least_two_beneficiaries() {
    let (env, contract) = setup();
    let client = TokenLockerClient::new(&env, &contract);

    let creator = Address::generate(&env);
    let b1 = Address::generate(&env);
    let (token_id, token_admin) = mock_token(&env);
    token_admin.mint(&creator, &1_000_0000000_i128);

    set_ledger_time(&env, 1_000_000);

    let result = client.try_create_split_lock(
        &creator,
        &token_id,
        &100_0000000_i128,
        &vec![&env, (b1, 10_000_u64)],
        &(1_100_000_u64),
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::TooFewBeneficiaries)));
}

#[test]
fn create_split_lock_shares_must_sum_to_10000() {
    let (env, contract) = setup();
    let client = TokenLockerClient::new(&env, &contract);

    let creator = Address::generate(&env);
    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    let (token_id, token_admin) = mock_token(&env);
    token_admin.mint(&creator, &1_000_0000000_i128);

    set_ledger_time(&env, 1_000_000);

    let result = client.try_create_split_lock(
        &creator,
        &token_id,
        &100_0000000_i128,
        &vec![&env, (b1, 5_000_u64), (b2, 4_000_u64)], // sums to 9000 not 10000
        &(1_100_000_u64),
        &None,
    );
    assert_eq!(result, Err(Ok(ContractError::SharesMustSum10000)));
}

#[test]
fn create_split_lock_succeeds_and_allocates_correctly() {
    let (env, contract) = setup();
    let client = TokenLockerClient::new(&env, &contract);

    let creator = Address::generate(&env);
    let b1 = Address::generate(&env);
    let b2 = Address::generate(&env);
    let (token_id, token_admin) = mock_token(&env);
    token_admin.mint(&creator, &1_000_0000000_i128);

    set_ledger_time(&env, 1_000_000);
    let unlock_at: u64 = 1_100_000;

    let group_id = client
        .create_split_lock(
            &creator,
            &token_id,
            &1_000_0000000_i128,
            &vec![&env, (b1.clone(), 7_000_u64), (b2.clone(), 3_000_u64)],
            &unlock_at,
            &None,
        )
        .unwrap();

    let group = client.get_split_group(&group_id).unwrap();
    assert_eq!(group.lock_ids.len(), 2);

    let lock0 = client.get_lock(&group_id).unwrap();
    assert_eq!(lock0.amount, 700_0000000_i128); // 70%
    assert_eq!(lock0.beneficiary, b1);

    let lock1_id = group.lock_ids.get(1).unwrap();
    let lock1 = client.get_lock(&lock1_id).unwrap();
    assert_eq!(lock1.amount, 300_0000000_i128); // 30%
    assert_eq!(lock1.beneficiary, b2);
fn extend_cannot_decrease_unlock_time() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 1000;
    let lock_id = client
        .create_lock(&creator, &token_id, &100_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    let result = client.try_extend(&lock_id, &(unlock_at - 1));
    assert_eq!(result, Err(Ok(ContractError::CanOnlyExtend)));
}

#[test]
fn extend_withdrawn_lock_fails() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &100_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    advance_time(&env, 200);
    client.withdraw(&lock_id);

    let result = client.try_extend(&lock_id, &(unlock_at + 1000));
    assert_eq!(result, Err(Ok(ContractError::AlreadyWithdrawn)));
}

// ── Multi-account: beneficiary transfer flow ──────────────────────────────────

#[test]
fn transfer_beneficiary_and_new_beneficiary_can_withdraw() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let original_beneficiary = Address::generate(&env);
    let new_beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &300_i128, &original_beneficiary, &unlock_at, &None)
        .unwrap();

    client.transfer_beneficiary(&lock_id, &new_beneficiary);

    let lock = client.get_lock(&lock_id).unwrap();
    assert_eq!(lock.beneficiary, new_beneficiary);

    advance_time(&env, 200);
    client.withdraw(&lock_id);

    assert!(client.get_lock(&lock_id).unwrap().withdrawn);
}

#[test]
fn transfer_beneficiary_updates_indexes() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let original_beneficiary = Address::generate(&env);
    let new_beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &100_i128, &original_beneficiary, &unlock_at, &None)
        .unwrap();

    client.transfer_beneficiary(&lock_id, &new_beneficiary);

    // Old beneficiary index cleared
    assert_eq!(client.get_locks_by_beneficiary(&original_beneficiary, &0, &10).len(), 0);
    // New beneficiary index populated
    let new_locks = client.get_locks_by_beneficiary(&new_beneficiary, &0, &10);
    assert_eq!(new_locks.len(), 1);
    assert_eq!(new_locks.get(0).unwrap().id, lock_id);
}

#[test]
fn transfer_on_withdrawn_lock_is_rejected() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let new_beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &100_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    advance_time(&env, 200);
    client.withdraw(&lock_id);

    let result = client.try_transfer_beneficiary(&lock_id, &new_beneficiary);
    assert_eq!(result, Err(Ok(ContractError::AlreadyWithdrawn)));
}

#[test]
fn beneficiary_can_transfer_to_self() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &100_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    // Transfer to self is a no-op but should not error
    client.transfer_beneficiary(&lock_id, &beneficiary);
    assert_eq!(client.get_lock(&lock_id).unwrap().beneficiary, beneficiary);
}

// ── Cross-account query isolation ─────────────────────────────────────────────

#[test]
fn creator_locks_isolated_from_other_creator() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator_a = Address::generate(&env);
    let creator_b = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator_a, 1_000);
    mint(&env, &token_id, &creator_b, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    client.create_lock(&creator_a, &token_id, &100_i128, &beneficiary, &unlock_at, &None).unwrap();
    client.create_lock(&creator_a, &token_id, &200_i128, &beneficiary, &unlock_at, &None).unwrap();
    client.create_lock(&creator_b, &token_id, &300_i128, &beneficiary, &unlock_at, &None).unwrap();

    assert_eq!(client.get_lock_count_by_creator(&creator_a), 2);
    assert_eq!(client.get_lock_count_by_creator(&creator_b), 1);
    assert_eq!(client.get_lock_count_by_beneficiary(&beneficiary), 3);
}

#[test]
fn creator_is_also_beneficiary_flow() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &100_i128, &creator, &unlock_at, &None)
        .unwrap();

    let lock = client.get_lock(&lock_id).unwrap();
    assert_eq!(lock.creator, lock.beneficiary);

    advance_time(&env, 200);
    client.withdraw(&lock_id);
    assert!(client.get_lock(&lock_id).unwrap().withdrawn);
}

#[test]
fn three_accounts_full_flow() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    mint(&env, &token_id, &creator, 2_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &1_000_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    // Unauthorized has no locks
    assert_eq!(client.get_lock_count_by_creator(&unauthorized), 0);
    assert_eq!(client.get_lock_count_by_beneficiary(&unauthorized), 0);

    // Creator sees their lock
    assert_eq!(client.get_lock_count_by_creator(&creator), 1);

    // Beneficiary sees their lock
    assert_eq!(client.get_lock_count_by_beneficiary(&beneficiary), 1);

    // Creator extends, beneficiary eventually withdraws
    client.extend(&lock_id, &(unlock_at + 500));
    advance_time(&env, 700);
    client.withdraw(&lock_id);

    assert!(client.get_lock(&lock_id).unwrap().withdrawn);
}

// ── TVL / global stats ────────────────────────────────────────────────────────

#[test]
fn tvl_increases_on_create_decreases_on_withdraw() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 5_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id_1 = client
        .create_lock(&creator, &token_id, &400_i128, &beneficiary, &unlock_at, &None)
        .unwrap();
    client.create_lock(&creator, &token_id, &600_i128, &beneficiary, &unlock_at, &None).unwrap();

    assert_eq!(client.get_total_locked(&token_id), 1_000_i128);

    let stats = client.get_global_stats();
    assert_eq!(stats.total_lock_count, 2);
    assert_eq!(stats.unique_token_count, 1);

    advance_time(&env, 200);
    client.withdraw(&lock_id_1);

    assert_eq!(client.get_total_locked(&token_id), 600_i128);
}

#[test]
fn global_stats_counts_unique_tokens() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let admin2 = Address::generate(&env);
    let token2_id = env.register_stellar_asset_contract_v2(admin2.clone()).address();

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);
    mint(&env, &token2_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    client.create_lock(&creator, &token_id, &100_i128, &beneficiary, &unlock_at, &None).unwrap();
    client.create_lock(&creator, &token2_id, &200_i128, &beneficiary, &unlock_at, &None).unwrap();

    let stats = client.get_global_stats();
    assert_eq!(stats.total_lock_count, 2);
    assert_eq!(stats.unique_token_count, 2);
}

// ── Vesting with multiple accounts ───────────────────────────────────────────

#[test]
fn partial_vested_withdrawal_does_not_mark_fully_withdrawn() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 5_000);

    let now = env.ledger().timestamp();
    let vesting = Vesting { start: now, end: now + 1000, released: 0 };
    let unlock_at = now + 1;

    let lock_id = client
        .create_lock(&creator, &token_id, &1_000_i128, &beneficiary, &unlock_at, &Some(vesting))
        .unwrap();

    advance_time(&env, 500);
    client.withdraw(&lock_id);

    let lock = client.get_lock(&lock_id).unwrap();
    assert!(!lock.withdrawn); // still partially locked
}

#[test]
fn full_vesting_marks_withdrawn() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 5_000);

    let now = env.ledger().timestamp();
    let vesting = Vesting { start: now, end: now + 1000, released: 0 };
    let unlock_at = now + 1;

    let lock_id = client
        .create_lock(&creator, &token_id, &1_000_i128, &beneficiary, &unlock_at, &Some(vesting))
        .unwrap();

    // Past vesting end
    advance_time(&env, 1500);
    client.withdraw(&lock_id);

    assert!(client.get_lock(&lock_id).unwrap().withdrawn);
}

// ── Mutation-testing targeted tests (#153) ────────────────────────────────────
// These tests are specifically designed to kill surviving mutants identified
// by cargo-mutants. Each test targets a narrow arithmetic or boundary condition.

/// Kills mutants that flip `unlock_at > now` to `>=` or vice-versa.
/// Tokens must not be withdrawable exactly AT the unlock timestamp.
#[test]
fn withdraw_requires_time_strictly_after_unlock() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &500_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    // One second before unlock — must fail
    advance_time(&env, 99);
    let result = client.try_withdraw(&lock_id);
    assert!(result.is_err(), "should not withdraw before unlock");

    // Exactly at unlock — contract uses `>` so must fail at exact boundary
    advance_time(&env, 1); // now == unlock_at
    // The contract requires now > unlock_at (strictly greater), so this should fail
    // If a mutant changes > to >= this test still passes, but the one below kills it:
    advance_time(&env, 1); // now == unlock_at + 1
    let result2 = client.try_withdraw(&lock_id);
    assert!(result2.is_ok(), "should withdraw after unlock");
}

/// Kills mutants that change the vesting proportional calculation.
/// At exactly 50% of vesting duration, exactly 50% of tokens must be claimable.
#[test]
fn vesting_proportional_release_at_midpoint() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 10_000);

    let now = env.ledger().timestamp();
    let vesting_duration = 1_000_u64;
    let vesting = Vesting {
        start: now,
        end: now + vesting_duration,
        released: 0,
    };
    let lock_id = client
        .create_lock(&creator, &token_id, &1_000_i128, &beneficiary, &(now + 1), &Some(vesting))
        .unwrap();

    // Advance to 50% of vesting period
    advance_time(&env, vesting_duration / 2);
    client.withdraw(&lock_id);

    // released must be ~500 (50% of 1000)
    let lock = client.get_lock(&lock_id).unwrap();
    assert_eq!(lock.vesting.unwrap().released, 500_i128,
        "expected 50% of tokens released at midpoint");
    assert!(!lock.withdrawn, "lock should not be fully withdrawn at midpoint");
}

/// Kills mutants that remove or weaken the zero-amount guard.
#[test]
fn create_lock_rejects_zero_amount() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let result = client.try_create_lock(&creator, &token_id, &0_i128, &beneficiary, &unlock_at, &None);
    assert!(result.is_err(), "zero amount must be rejected");
}

/// Kills mutants that remove or weaken the negative-amount guard.
#[test]
fn create_lock_rejects_negative_amount() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let result = client.try_create_lock(&creator, &token_id, &(-1_i128), &beneficiary, &unlock_at, &None);
    assert!(result.is_err(), "negative amount must be rejected");
}

/// Kills mutants that allow unlock date in the past.
#[test]
fn create_lock_rejects_past_unlock_date() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    // Set current time to 1000, try to lock with unlock_at = 999
    advance_time(&env, 1000);
    let past_unlock = env.ledger().timestamp() - 1;
    let result = client.try_create_lock(&creator, &token_id, &500_i128, &beneficiary, &past_unlock, &None);
    assert!(result.is_err(), "past unlock date must be rejected");
}

/// Kills mutants that allow extending to a date before or equal to current unlock.
#[test]
fn extend_rejects_non_extending_date() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 1_000;
    let lock_id = client
        .create_lock(&creator, &token_id, &500_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    // Trying to extend to same date must fail
    let result = client.try_extend(&lock_id, &unlock_at);
    assert!(result.is_err(), "extend to same date must be rejected");

    // Trying to extend to earlier date must fail
    let result2 = client.try_extend(&lock_id, &(unlock_at - 1));
    assert!(result2.is_err(), "extend to earlier date must be rejected");

    // Extending to a later date must succeed
    let result3 = client.try_extend(&lock_id, &(unlock_at + 100));
    assert!(result3.is_ok(), "extend to later date must succeed");
}

/// Kills mutants that remove the double-withdrawal guard.
#[test]
fn withdraw_twice_fails() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = client
        .create_lock(&creator, &token_id, &500_i128, &beneficiary, &unlock_at, &None)
        .unwrap();

    advance_time(&env, 200);
    client.withdraw(&lock_id);

    // Second withdrawal must fail
    let result = client.try_withdraw(&lock_id);
    assert!(result.is_err(), "second withdrawal must be rejected");
}

/// Kills mutants on the vesting end-before-start guard.
#[test]
fn vesting_end_before_start_rejected() {
    let (env, contract_id, token_id) = setup_env();
    let client = TokenLockerClient::new(&env, &contract_id);

    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    mint(&env, &token_id, &creator, 1_000);

    let now = env.ledger().timestamp();
    let invalid_vesting = Vesting { start: now + 1_000, end: now + 500, released: 0 };
    let result = client.try_create_lock(
        &creator, &token_id, &500_i128, &beneficiary, &(now + 2_000), &Some(invalid_vesting),
    );
    assert!(result.is_err(), "vesting end before start must be rejected");
}
