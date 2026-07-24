# ADR-005: Linear Vesting Only

## Status
Accepted

## Context
Token locks may need to release funds gradually rather than all at once.
Several vesting schedules exist (cliff, step, linear, custom).

## Decision
Support only linear vesting. Each lock may carry an optional `Vesting` record
with `start`, `end`, and cumulative `released` amount. On withdrawal, the
contract calculates the linearly vested portion and releases it.

## Consequences
- Contract storage is simple: one `Vesting` struct per lock
- Frontend shows a single vesting badge and a countdown-based claim button
- No cliff, step, or custom schedule support — users must split locks manually
- Withdrawal before `end` releases only the vested portion; remainder stays locked
- `VestingEndBeforeStart` is a contract-level guard
