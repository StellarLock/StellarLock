#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, vec,
    Address, Env, String, Vec, Symbol,
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

// ── On-chain types ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct Vesting {
    pub start: u64,
    pub end: u64,
    pub released: i128,
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
    pub metadata: LockMetadata,
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

fn collect_locks(env: &Env, ids: Vec<u64>) -> Vec<Lock> {
    let mut out: Vec<Lock> = vec![env];
    for id in ids.iter() {
        if let Some(lock) = env.storage().persistent().get(&DataKey::Lock(id)) {
            out.push_back(lock);
        }
    }
    out
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct TokenLocker;

#[contractimpl]
impl TokenLocker {
    /// Lock `amount` of `token` until `unlock_at` (unix seconds).
    /// The caller must be `creator` and must have approved the transfer.
    /// Returns the new lock id.
    pub fn create_lock(
        env: Env,
        creator: Address,
        token: Address,
        amount: i128,
        beneficiary: Address,
        unlock_at: u64,
        vesting: Option<Vesting>,
        metadata: LockMetadata,
    ) -> u64 {
        creator.require_auth();

        assert!(amount > 0, "amount must be positive");
        let now = env.ledger().timestamp();
        assert!(unlock_at > now, "unlock_at must be in the future");

        if let Some(ref v) = vesting {
            assert!(v.end > v.start, "vesting end must be after start");
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
            metadata,
        };

        save_lock(&env, &lock);
        push_index(&env, DataKey::ByCreator(creator), id);
        push_index(&env, DataKey::ByBeneficiary(beneficiary), id);
        push_index(&env, DataKey::ByToken(token), id);

        env.events().publish((Symbol::new(&env, "lock_created"),), id);
        id
    }

    /// Withdraw locked tokens. Callable by the beneficiary after unlock_at.
    pub fn withdraw(env: Env, id: u64) {
        let mut lock = load_lock(&env, id);
        lock.beneficiary.require_auth();

        assert!(!lock.withdrawn, "already withdrawn");
        let now = env.ledger().timestamp();
        assert!(now >= lock.unlock_at, "still locked");

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

        assert!(releasable > 0, "nothing to release");

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
        env.events().publish((Symbol::new(&env, "extended"),), id);
    }

    // ── Read methods ──────────────────────────────────────────────────────────

    pub fn get_lock(env: Env, id: u64) -> Option<Lock> {
        env.storage().persistent().get(&DataKey::Lock(id))
    }

    pub fn get_locks_by_creator(env: Env, creator: Address) -> Vec<Lock> {
        let ids = get_index(&env, DataKey::ByCreator(creator));
        collect_locks(&env, ids)
    }

    pub fn get_locks_by_beneficiary(env: Env, beneficiary: Address) -> Vec<Lock> {
        let ids = get_index(&env, DataKey::ByBeneficiary(beneficiary));
        collect_locks(&env, ids)
    }

    pub fn get_locks_by_token(env: Env, token: Address) -> Vec<Lock> {
        let ids = get_index(&env, DataKey::ByToken(token));
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

    fn setup(env: &Env) -> (Address, Address, TokenClient<'static>, TokenLockerClient<'static>) {
        let admin = Address::generate(env);
        let creator = Address::generate(env);
        let beneficiary = Address::generate(env);
        let (token, token_admin) = create_token(env, &admin);
        token_admin.mint(&creator, &1_000_000);

        let contract_id = env.register(TokenLocker, ());
        let client = TokenLockerClient::new(env, &contract_id);

        (creator, beneficiary, token, client)
    }

    #[test]
    fn create_lock_stores_metadata() {
        let env = Env::default();
        env.mock_all_auths();
        let (creator, beneficiary, token, client) = setup(&env);

        let metadata = LockMetadata {
            description: String::from_str(&env, "Team allocation, locked for trust"),
            project_url: String::from_str(&env, "https://example.com"),
            logo_url: String::from_str(&env, "https://example.com/logo.png"),
        };

        let now = env.ledger().timestamp();
        let id = client.create_lock(
            &creator,
            &token.address,
            &500,
            &beneficiary,
            &(now + 1_000),
            &None,
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
        let (creator, beneficiary, token, client) = setup(&env);

        let empty = LockMetadata {
            description: String::from_str(&env, ""),
            project_url: String::from_str(&env, ""),
            logo_url: String::from_str(&env, ""),
        };

        let now = env.ledger().timestamp();
        let id = client.create_lock(
            &creator,
            &token.address,
            &500,
            &beneficiary,
            &(now + 1_000),
            &None,
            &empty,
        );

        let lock = client.get_lock(&id).expect("lock should exist");
        assert!(lock.metadata.is_empty());
    }
}
