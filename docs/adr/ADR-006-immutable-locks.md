# ADR-006: Immutable Locks and Upgrade Timelock

## Status
Accepted

## Context
Token locks must be trustless: a creator should not be able to rug-pull by
withdrawing early. Likewise, contract upgrades must not be executable instantly,
or a compromised admin key could deploy malicious code.

## Decision
Enforce two complementary security guarantees on-chain:
1. **Immutable locks** — only the beneficiary may withdraw after `unlock_at`. The
   creator can only extend the unlock date (`CanOnlyExtend`), never shorten it
   or reclaim funds.
2. **7-day upgrade timelock** — any WASM upgrade proposed by the admin must wait
   7 days before execution, giving the community time to review the new code.

## Consequences
- `withdraw` requires `lock.beneficiary.require_auth()`
- `extend` requires `lock.creator.require_auth()` and rejects `new_unlock_at <= unlock_at`
- `propose_upgrade` sets `execute_after = now + 7 days`; `execute_upgrade` panics
  if the timelock has not elapsed
- UI surfaces the immutable-lock warning prominently in the confirmation modal
- Admin role is separate from beneficiary/creator roles; admin cannot move user funds
