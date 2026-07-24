# Contributing

## Prerequisites

- **Node.js** 18+
- **pnpm** — `npm install -g pnpm`
- **Rust** — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Stellar CLI** — `cargo install stellar-cli --features opt`
- **Freighter** browser extension set to Testnet

## Setup

```bash
git clone https://github.com/mc-stephen/StellarLock.git
cd StellarLock
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

### Frontend

```bash
pnpm build
```

### Contracts

```bash
cd contracts
stellar contract build
```

Compiled WASM files land in `contracts/target/wasm32v1-none/release/`.

## Deploy to Testnet

```bash
stellar keys generate myaccount --network testnet
stellar keys fund myaccount --network testnet
cd contracts
./deploy.sh myaccount
```

Paste the printed contract IDs into `src/lib/stellar.ts`.

## Code Style

- TypeScript strict mode is enabled — avoid `any` where possible
- Format Rust code with `cargo fmt` and check with `cargo clippy`
- Follow existing patterns in the codebase (component structure, hooks, contract layout)

## Pull Requests

- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- Keep PRs focused on a single concern
- Reference the issue in the PR body with `Closes #N`
- Squash merge when ready

## Branch Protection

The `main` branch is protected. Direct pushes are blocked. All changes must go through a pull request.

**Rules enforced on `main`:**

| Rule | Setting |
|---|---|
| Required approving reviews | 1 (code-owner review required for contract/CI changes) |
| Dismiss stale reviews on new push | Enabled |
| Status checks must pass | Required (linting, build, tests) |
| Branch must be up to date before merge | Enabled |
| Force pushes | Disabled |
| Branch deletion | Disabled |
| Conversation resolution | Required before merge |
| Rule applies to admins | Enabled |

**CODEOWNERS** (`.github/CODEOWNERS`) maps directories to reviewer groups:

| Path | Required reviewer |
|---|---|
| `/contracts/` | `@StellarLock/core-team` |
| `/src/lib/` | `@StellarLock/core-team` |
| `/src/` | `@StellarLock/frontend-team` |
| `/.github/` | `@StellarLock/lead` |
| `package.json`, `Cargo.toml` | `@StellarLock/core-team` |

To update protection rules, a repository admin must use the GitHub UI (**Settings → Branches**) or the GitHub API. Do not bypass reviews with admin overrides on contract-touching PRs.


## Commit Message Format
We use [Conventional Commits](https://www.conventionalcommits.org/).

Format: `type(scope): description`

Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`
Allowed scopes: `contract`, `frontend`, `ci`, `docs`

Examples:
- `feat(frontend): add export button to My Locks page`
- `fix(contract): prevent overflow in extend lock duration`

Run `pnpm release` to generate CHANGELOG.md and tag a new version.