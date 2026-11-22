# Documentation

Index of the project documentation in `docs/`. Check here before writing a new document — the topic may already be covered.

## Architecture & design

| Document | Description |
|---|---|
| [architecture.md](./architecture.md) | Data flow from chain to UI: sources, Mermaid diagram, per-page sources and fallbacks, and why totals and links differ |
| [browser-storage.md](./browser-storage.md) | Every localStorage / sessionStorage key: purpose, data, retention, and how to clear it |
| [contract-call-surface.md](./contract-call-surface.md) | Every contract method the frontend calls, its ScVal encoding vs the Rust signature, and the proposed spec-drift CI check |
| [rpc-client-testing.md](./rpc-client-testing.md) | `RpcClient` concurrency, retry, dedupe and cache behaviours, and how to test them with fake timers |
| [adr/](./adr/README.md) | Architecture Decision Records — one file per significant design decision, with its own index |
| [indexer-architecture.md](./indexer-architecture.md) | How the indexer turns Soroban contract events into SQLite state: idempotency, cursor recovery, release accounting |
| [data-sourcing.md](./data-sourcing.md) | The indexer-first, RPC-fallback convention the frontend uses to read lock data |
| [notification-service.md](./notification-service.md) | Unlock-reminder notifier: cron worker, subscription API, schema, and email/webhook delivery |
| [storage-optimization.md](./storage-optimization.md) | Contract storage and rent optimizations for `token-locker` and `lp-locker` |
| [lp-pool-token-verification.md](./lp-pool-token-verification.md) | Best-effort pool-token verification in `lp-locker` and its security implications |

## Operations & security

| Document | Description |
|---|---|
| [deploying-backend.md](./deploying-backend.md) | Running the indexer and notifier in production: Docker Compose / hosted setup, env vars, health checks, backups, cursor and DB recovery (issue #1162) |
| [incident-response.md](./incident-response.md) | Operator runbook for emergency `pause()` / `unpause()` on both contracts |
| [security-audit.md](./security-audit.md) | Contract threat model and security audit checklist |
| [troubleshooting.md](./troubleshooting.md) | Common user-facing errors (wallet, network, transactions, contract) with causes and fixes |

## Project & process

| Document | Description |
|---|---|
| [changes.md](./changes.md) | Hand-written rationale behind selected changes, by issue (the release list lives in [CHANGELOG.md](../CHANGELOG.md)) |
| [roadmap-notes.md](./roadmap-notes.md) | Internal planning notes on open feature gaps (batch lock creation, Arabic localization) |
| [bounty-payout-policy-357.md](./bounty-payout-policy-357.md) | Contribution and bounty payout policy (issue #357) |
| [issue-713-bulk-partial-failure.md](./issue-713-bulk-partial-failure.md) | Analysis of untested partial-failure handling in MyLocks bulk extend/transfer (issue #713) |
| [issue-1097-split-group-on-lock-detail.md](./issue-1097-split-group-on-lock-detail.md) | `getSplitGroup` bindings, child→group lookup and a "Part of split group" section on LockDetail (issue #1097) |
| [issue-1098-lp-locks-by-underlying-token.md](./issue-1098-lp-locks-by-underlying-token.md) | Indexing `token_a`/`token_b` and an `?underlying=` API so Explorer lists LP locks containing a token (issue #1098) |
| [issue-1099-lock-logo-url-privacy.md](./issue-1099-lock-logo-url-privacy.md) | https-only, no-referrer, lazy / click-to-load handling of creator-supplied lock logos (issue #1099) |
| [issue-1100-csp-connect-src-wildcard.md](./issue-1100-csp-connect-src-wildcard.md) | Removing the bare `https:` from CSP `connect-src`, proxying `stellar.toml`, and how to extend the allowlist (issue #1100) |
| [issue-1160-dependabot-docker.md](./issue-1160-dependabot-docker.md) | Adding a Dependabot `docker` entry for `Dockerfile.dev` / `Dockerfile.contracts` (issue #1160) |
| [issue-1161-notification-settings-e2e.md](./issue-1161-notification-settings-e2e.md) | E2E test plan for the LockDetail notification panel's subscribe/unsubscribe requests (issue #1161) |
| [issue-1163-db-migration-smoke-tests.md](./issue-1163-db-migration-smoke-tests.md) | Fixture-based tests for `initDb()` migrations from each historical schema (issue #1163) |
| [bounty-payout-policy.md](./bounty-payout-policy.md) | Contribution and bounty payout policy |
| [bulk-actions-partial-failure.md](./bulk-actions-partial-failure.md) | Analysis of untested partial-failure handling in MyLocks bulk extend/transfer |
| [screenshots/](./screenshots/) | App screenshots embedded in the main README |
