# ADR-003: Serverless — No Backend, Direct RPC

## Status
Accepted

## Context
StellarLock is a public explorer and lock-creation UI. It needs on-chain data
and transaction submission but does not require a custom API layer.

## Decision
Run as a static frontend with no backend server. All contract reads and writes
go directly from the browser to the Soroban RPC endpoint.

## Consequences
- Zero backend infrastructure cost or maintenance
- CSP and Vercel edge config are the only deployment concerns
- Frontend is deployed as a static site (Vercel SPA rewrite to `index.html`)
- Contract RPC calls are wrapped in `src/lib/stellar.ts` (`RpcClient` class)
- Local read caching and concurrency limits live in the frontend
- No server-side rate limiting or auth — security is contract-enforced
