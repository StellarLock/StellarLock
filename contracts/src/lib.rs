const MAX_LOCK_DURATION: u64 = 10 * 365 * 24 * 60 * 60; // 10 years

// In your Error enum:
LockDurationTooLong = 10,

if unlock_at > env.ledger().timestamp() + MAX_LOCK_DURATION {
    panic_with_error!(env, Error::LockDurationTooLong);
}

const maxDate = new Date();
maxDate.setFullYear(maxDate.getFullYear() + 10);
// Also show a warning if > 2 years

pub fn initialize(env: Env, owner: Address) { ... }
pub fn set_admin(env: Env, admin: Address) { ... }      // owner-only
pub fn remove_admin(env: Env, admin: Address) { ... }   // owner-only
pub fn transfer_ownership(env: Env, new_owner: Address) { ... } // two-step
pub fn accept_ownership(env: Env) { ... }               // step 2
pub fn is_admin(env: Env, addr: Address) -> bool { ... }