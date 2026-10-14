# Documentation

This index links to every Markdown document in this directory.

## Operations and architecture

- [Data sourcing](data-sourcing.md) — explains how the frontend combines indexed data with direct Soroban RPC reads.
- [Incident response](incident-response.md) — runbook for pausing and unpausing the token and LP locker contracts.
- [Indexer architecture](indexer-architecture.md) — describes event ingestion, replay, and the SQLite state used by the API and frontend.
- [Notification service](notification-service.md) — documents unlock notifications sent by email and webhook.
- [Troubleshooting](troubleshooting.md) — lists common errors and their causes and fixes.

## Security and project notes

- [Contract security audit checklist](security-audit.md) — threat model and security checks for the contracts.
- [Storage optimization issue #148](storage-optimization-148.md) — records the storage inefficiencies tracked by issue #148.
- [Issue #713 bulk-operation notes](issue-713-bulk-partial-failure.md) — tracks partial-failure handling for bulk lock extensions and transfers.
- [Changes](changes.md) — records the rationale behind selected changes; release history is maintained in `CHANGELOG.md`.
- [Roadmap notes](roadmap-notes.md) — internal planning notes about feature gaps.
- [Contribution and bounty payout policy](bounty-payout-policy-357.md) — documents the payout policy discussed in issue #357.

## Architecture decision records

- [ADR index](adr/README.md) — overview of the architecture decision records.
- [ADR-001: Use Soroban for smart contracts](adr/ADR-001-soroban-smart-contracts.md) — selects Soroban as the smart-contract platform.
- [ADR-002: Separate token and LP lockers](adr/ADR-002-separate-locker-contracts.md) — explains why token and liquidity-pool locks use separate contracts.
- [ADR-003: Serverless architecture](adr/ADR-003-serverless-architecture.md) — records the direct-RPC architecture without a backend.
- [ADR-004: Freighter-first wallet strategy](adr/ADR-004-freighter-wallet-strategy.md) — describes the wallet integration approach.
- [ADR-005: Linear vesting only](adr/ADR-005-linear-vesting-only.md) — records the initial vesting model for token locks.
- [ADR-006: Immutable locks and upgrade timelock](adr/ADR-006-immutable-locks.md) — explains the immutability and upgrade-safety model.
- [ADR-007: React, Vite, and Tailwind](adr/ADR-007-frontend-stack.md) — records the frontend technology choices.
- [ADR-008: Indexer-backed stats and zeroed fallback](adr/ADR-008-mock-data-testnet.md) — records the move from mock statistics to live indexer data.
- [ADR-009: Optional LP locker vesting](adr/ADR-009-lp-vesting.md) — records optional linear vesting for LP locks.
- [ADR-010: Rate limiting with temporary storage](adr/ADR-010-rate-limit-via-temporary-storage.md) — describes per-creator rate limiting in contract storage.
- [ADR-010: RPC client caching](adr/ADR-010-rpc-client-caching.md) — describes request deduplication, response caching, concurrency limits, and retries.
- [ADR-010: Split-lock allocation](adr/ADR-010-split-lock-allocation.md) — records share allocation and rounding behavior for split locks.
- [ADR template](adr/ADR-TEMPLATE.md) — template for documenting a new architecture decision.
