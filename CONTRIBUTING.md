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
