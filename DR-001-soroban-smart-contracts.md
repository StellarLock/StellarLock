# ADR-001: Use Soroban for Smart Contracts

## Status
Accepted

## Context
StellarLock needs a smart contract platform to enforce immutable token locks.
Options considered: Stellar Classic (CLAIMABLE_BALANCE), EVM-compatible sidechains,
and Soroban (Stellar's native smart contract layer).

## Decision
Use Soroban. It is natively integrated with Stellar, shares the same asset model,
has no bridge risk, and supports Rust-based contracts with on-chain storage.

## Consequences
- Contracts are written in Rust, requiring Rust knowledge from contributors
- Limited ecosystem tooling compared to EVM, but growing fast
- Direct XLM/SAT fee model with no gas estimation complexity