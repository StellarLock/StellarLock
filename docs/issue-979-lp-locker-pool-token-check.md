# Issue #979 — Document the best-effort pool-token check in `lp-locker`

**GitHub:** https://github.com/StellarLock/StellarLock/issues/979  
**Status:** Resolved in PR #1006  
**Area:** `contracts/lp-locker/src/lib.rs`, `contracts/README.md`

---

## Background

`create_lock` in `lp-locker` accepts `token_a` and `token_b` arguments that identify the
two underlying tokens of the LP pool. Before issue #732 there was no cross-check between
those caller-supplied addresses and what the pool contract itself reports.

Issue #732 added `verify_pool_tokens`, a helper that attempts to verify the pair by calling
`token_a()` and `token_b()` getters on the `pool_share` contract. However, the check is
intentionally **best-effort**: pools that do not expose those getters pass through
unchecked. This limitation was undocumented, creating a risk that integrators and auditors
would assume a stronger guarantee than the contract actually provides.

---

## What `verify_pool_tokens` does

```rust
fn verify_pool_tokens(
    env: &Env,
    pool_share: &Address,
    token_a: &Address,
    token_b: &Address,
) -> Result<(), ContractError> {
    // Try token_a() getter
    let reported_a: Address =
        match env.try_invoke_contract::<Address, InvokeError>(
            pool_share, &Symbol::new(env, "token_a"), vec![env],
        ) {
            Ok(Ok(addr)) => addr,
            _ => return Ok(()), // getter absent or call failed — skip
        };

    // Try token_b() getter
    let reported_b: Address =
        match env.try_invoke_contract::<Address, InvokeError>(
            pool_share, &Symbol::new(env, "token_b"), vec![env],
        ) {
            Ok(Ok(addr)) => addr,
            _ => return Ok(()),
        };

    if &reported_a != token_a || &reported_b != token_b {
        return Err(ContractError::InvalidPoolTokens); // error code 28
    }
    Ok(())
}
```

The function is called in `create_lock` immediately after the `IdenticalTokens` guard,
before the rate-limit check and the token transfer.

---

## Behaviour summary

| Pool interface | Result |
|---|---|
| Exposes `token_a()` / `token_b()` and they match the supplied arguments | ✅ Check passes, lock proceeds |
| Exposes both getters but they return different addresses | ❌ Rejected — `InvalidPoolTokens` (error 28) |
| Does not expose those getters, or the cross-contract call fails for any reason | ⚠️ Check silently skipped — lock proceeds with no token-pair guarantee |

---

## Error code

`InvalidPoolTokens = 28` was added to `ContractError` in `lp-locker/src/lib.rs`. Error
codes 26 and 27 are reserved for future use.

---

## Security considerations

- A pool with a non-standard interface can bypass the check entirely by not implementing
  the getters.
- A malicious pool that *does* implement the getters can report false token addresses to
  trick the check. The contract cannot distinguish a legitimate pool from a malicious one
  that lies through its getters.
- Integrators and auditors **must not** treat the `token_a`/`token_b` fields on a stored
  `LpLock` as a cryptographic proof of the pool's composition. They are a best-effort hint
  recorded at lock-creation time.

---

## Documentation added

- `contracts/README.md` — new **Pool-token verification (best-effort)** subsection under
  `lp-locker` with the three-scenario table and the security note above.
- `contracts/README.md` — new **Error codes** section listing all integrator-relevant error
  codes including `InvalidPoolTokens = 28`.
- `create_lock` doc comment in `lp-locker/src/lib.rs` — expanded with a
  "Pool-token verification" section covering enforcement conditions, skip conditions, and
  a link to the README.
