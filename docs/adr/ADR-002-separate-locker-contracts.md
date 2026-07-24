# ADR-002: Separate Token and LP Locker Contracts

## Status
Accepted

## Context
StellarLock needs to lock both single-asset tokens and liquidity pool (LP) shares.
A single contract could handle both, but their data models and DEX integrations differ.

## Decision
Deploy two separate Soroban contracts:
- `token-locker` — locks single-asset tokens (any Stellar asset contract)
- `lp-locker` — locks pool shares, with DEX-specific logic (Soroswap, Aquarius)

## Consequences
- Each contract has a smaller, focused storage schema and API surface
- LP contract carries extra fields (`dex`, `token_a`, `token_b`, `pool_share`)
- Deployment and upgrade are two independent operations
- Frontend maintains parallel client libraries (`src/lib/token-locker.ts`, `src/lib/lp-locker.ts`)
- Contract addresses are tracked separately in `src/lib/contracts.generated.ts`
