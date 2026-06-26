#![cfg(test)]
use soroban_sdk::{contracttype, testutils::EnvTestConfig, token, Address, Env, Symbol, Vec};
use soroban_sdk::testutils::{Env, MockAuth};

use crate::{ContractError, Lock, TokenLocker};

#[derive(contracttype)]
pub enum TokenInterface {
    Transfer,
    Balance,
}

#[test]
fn create_lock_valid_inputs() {
    let env = Env::default();
    let creator = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let token_id = Address::generate(&env);

    env.register_stellar_asset_contract(creator.clone());
    let token = token::Client::new(&env, &token_id);
    token.mock_auths(&[MockAuth::authorize_all(&creator)]);

    token.transfer(&creator, &env.current_contract_address(), &100_i128);

    let unlock_at = env.ledger().timestamp() + 100;
    let lock_id = TokenLocker::create_lock(
        env.clone(),
        creator.clone(),
        token_id.clone(),
        100_i128,
        beneficiary.clone(),
        unlock_at,
        None,
    )
    .expect("create_lock should succeed");

    let lock = TokenLocker::get_lock(env.clone(), lock_id).expect("lock exists");
    assert_eq!(lock.amount, 100_i128);
    assert_eq!(lock.creator, creator);
    assert_eq!(lock.beneficiary, beneficiary);
    assert_eq!(lock.unlock_at, unlock_at);
}
