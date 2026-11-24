# ADR-008: Mock Data Strategy for Testnet

## Status
Accepted

## Context
On testnet, real locks may be sparse or nonexistent. A blank explorer page
hurts UX and makes it hard to demonstrate the product before mainnet launch.

## Decision
Seed the Discover and Landing pages with a static `MOCK_LOCKS` array from
`src/lib/mock-data.ts`. Real on-chain data is used in the Explorer and MyLocks
pages via the contract RPC; mock data is purely for public-facing demo content.

## Consequences
- Landing and Discover pages render realistic TVL, token groups, and recent
  activity without any backend
- Mock data is TypeScript, typed to the same `Lock` interface as on-chain data
- No network request is made for mock pages, so they work offline and in
  restricted environments
- Transition to real data requires removing the `MOCK_LOCKS` import and
  swapping in live `useLocks` hooks
