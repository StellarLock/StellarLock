# ADR-004: Freighter-First Wallet Strategy

## Status
Accepted

## Context
StellarLock needs users to sign transactions. Stellar has multiple wallet
extensions; choosing the wrong abstraction can lock out users or introduce
dependency risk.

## Decision
Use `@creit.tech/stellar-wallets-kit` (Stellar Wallets Kit) with `allowAllModules()`.
Freighter is the primary tested wallet, but the kit also supports other Stellar
wallets (xBull, Albedo, etc.) without code changes.

## Consequences
- Wallet connection UI is a single modal provided by the kit
- Session recovery via `localStorage` with a 10-second connection poll
- Error messages are wallet-aware (Freighter-specific guidance when detected)
- `@stellar/freighter-api` is kept as a peer dependency for health checks
- Future wallet additions require no frontend code changes
