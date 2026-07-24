#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, vec,
    Address, Env, String, Symbol, Vec,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Lock(u64),
    NextId,
    ByCreator(Address),
    ByBeneficiary(Address),
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
}

#[contracttype]
#[derive(Clone)]
pub struct LpLock {
    pub id: u64,
    pub pool_share: Address,
    pub dex: String,
    pub token_a: Address,
    pub token_b: Address,
    pub amount: i128,
    pub creator: Address,
    pub beneficiary: Address,
    pub unlock_at: u64,
    pub created_at: u64,
    pub extended_count: u32,
    pub withdrawn: bool,
    pub metadata: LockMetadata,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn next_id(env: &Env) -> u64 {
    let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(5000);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));
    id
}

fn push_index(env: &Env, key: DataKey, id: u64) {
    let mut ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(vec![env]);
    ids.push_back(id);
    env.storage().persistent().set(&key, &ids);
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
    env.storage().persistent().set(&DataKey::Lock(lock.id), lock);
}

fn collect_locks(env: &Env, ids: Vec<u64>) -> Vec<LpLock> {
    let mut out: Vec<LpLock> = vec![env];
    for id in ids.iter() {
        if let Some(lock) = env.storage().persistent().get(&DataKey::Lock(id)) {
            out.push_back(lock);
        }
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
        dex: String,
        token_a: Address,
        token_b: Address,
        amount: i128,
        beneficiary: Address,
        unlock_at: u64,
        metadata: LockMetadata,
    ) -> u64 {
        creator.require_auth();

        assert!(amount > 0, "amount must be positive");
        let now = env.ledger().timestamp();
        assert!(unlock_at > now, "unlock_at must be in the future");

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
            metadata,
        };

        save_lock(&env, &lock);
        push_index(&env, DataKey::ByCreator(creator), id);
        push_index(&env, DataKey::ByBeneficiary(beneficiary), id);

        env.events().publish((Symbol::new(&env, "lp_lock_created"),), id);
        id
    }

    /// Withdraw pool-share tokens. Callable by beneficiary after unlock_at.
    pub fn withdraw(env: Env, id: u64) {
        let mut lock = load_lock(&env, id);
        lock.beneficiary.require_auth();

        assert!(!lock.withdrawn, "already withdrawn");
        assert!(env.ledger().timestamp() >= lock.unlock_at, "still locked");

        token::Client::new(&env, &lock.pool_share).transfer(
            &env.current_contract_address(),
            &lock.beneficiary,
            &lock.amount,
        );

        lock.withdrawn = true;
        save_lock(&env, &lock);
        env.events().publish((Symbol::new(&env, "lp_withdrawn"),), id);
    }

    /// Extend the unlock date (creator only, can only increase).
    pub fn extend(env: Env, id: u64, new_unlock_at: u64) {
        let mut lock = load_lock(&env, id);
        lock.creator.require_auth();

        assert!(!lock.withdrawn, "already withdrawn");
        assert!(new_unlock_at > lock.unlock_at, "can only extend, not shorten");

        lock.unlock_at = new_unlock_at;
        lock.extended_count += 1;

        save_lock(&env, &lock);
        env.events().publish((Symbol::new(&env, "lp_extended"),), id);
    }

    // ── Read methods ──────────────────────────────────────────────────────────

    pub fn get_lock(env: Env, id: u64) -> Option<LpLock> {
        env.storage().persistent().get(&DataKey::Lock(id))
    }

    pub fn get_locks_by_creator(env: Env, creator: Address) -> Vec<LpLock> {
        let ids = get_index(&env, DataKey::ByCreator(creator));
        collect_locks(&env, ids)
    }

    pub fn get_locks_by_beneficiary(env: Env, beneficiary: Address) -> Vec<LpLock> {
        let ids = get_index(&env, DataKey::ByBeneficiary(beneficiary));
        collect_locks(&env, ids)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::token::{StellarAssetClient, TokenClient};

    fn create_token<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        (
            TokenClient::new(env, &sac.address()),
            StellarAssetClient::new(env, &sac.address()),
        )
    }

    fn setup(env: &Env) -> (Address, Address, TokenClient<'static>, Address, Address, LpLockerClient<'static>) {
        let admin = Address::generate(env);
        let creator = Address::generate(env);
        let beneficiary = Address::generate(env);
        let (pool_share, pool_admin) = create_token(env, &admin);
        pool_admin.mint(&creator, &1_000_000);

        let token_a = Address::generate(env);
        let token_b = Address::generate(env);

        let contract_id = env.register(LpLocker, ());
        let client = LpLockerClient::new(env, &contract_id);

        (creator, beneficiary, pool_share, token_a, token_b, client)
    }

    #[test]
    fn create_lock_stores_metadata() {
        let env = Env::default();
        env.mock_all_auths();
        let (creator, beneficiary, pool_share, token_a, token_b, client) = setup(&env);

        let metadata = LockMetadata {
            description: String::from_str(&env, "Aquarius liquidity, locked"),
            project_url: String::from_str(&env, "https://example.com"),
            logo_url: String::from_str(&env, "https://example.com/logo.png"),
        };

        let now = env.ledger().timestamp();
        let id = client.create_lock(
            &creator,
            &pool_share.address,
            &String::from_str(&env, "aquarius"),
            &token_a,
            &token_b,
            &500,
            &beneficiary,
            &(now + 1_000),
            &metadata,
        );

        let lock = client.get_lock(&id).expect("lock should exist");
        assert!(!lock.metadata.is_empty());
        assert_eq!(lock.metadata.description, metadata.description);
        assert_eq!(lock.metadata.project_url, metadata.project_url);
        assert_eq!(lock.metadata.logo_url, metadata.logo_url);
    }

    #[test]
    fn create_lock_without_metadata_leaves_it_empty() {
        let env = Env::default();
        env.mock_all_auths();
        let (creator, beneficiary, pool_share, token_a, token_b, client) = setup(&env);

        let empty = LockMetadata {
            description: String::from_str(&env, ""),
            project_url: String::from_str(&env, ""),
            logo_url: String::from_str(&env, ""),
        };

        let now = env.ledger().timestamp();
        let id = client.create_lock(
            &creator,
            &pool_share.address,
            &String::from_str(&env, "aquarius"),
            &token_a,
            &token_b,
            &500,
            &beneficiary,
            &(now + 1_000),
            &empty,
        );

        let lock = client.get_lock(&id).expect("lock should exist");
        assert!(lock.metadata.is_empty());
    }
}
