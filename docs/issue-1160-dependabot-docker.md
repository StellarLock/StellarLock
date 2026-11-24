# Issue #1160 — Dependabot doesn't track the Docker base images

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1160  
**Status:** Open  
**Area:** `.github/dependabot.yml`, `Dockerfile.dev`, `Dockerfile.contracts`

---

## Problem

`.github/dependabot.yml` has update entries for three ecosystems:

| Ecosystem        | Directory    | Covers                           |
|------------------|--------------|----------------------------------|
| `npm`            | `/`          | `package.json` / `pnpm-lock.yaml` |
| `cargo`          | `/contracts` | Soroban contract crates          |
| `github-actions` | `/`          | `.github/workflows/*.yml`        |

Neither Dockerfile is tracked:

| File                   | Base image       | Used by                                                 |
|------------------------|------------------|---------------------------------------------------------|
| `Dockerfile.dev`       | `node:22-slim`   | `frontend`, `indexer` and `notifier` in `docker-compose.yml` |
| `Dockerfile.contracts` | `rust:1.93-slim` | `contracts` in `docker-compose.yml`                     |

Because no update entry covers these images, they go stale and miss the Debian and
runtime security patches that the upstream images ship. This matters most for
`Dockerfile.dev`: the [backend deployment guide](./deploying-backend.md) runs the
indexer and notifier on that image, so the dev image is also the production backend
image.

---

## Fix

Add a `docker` ecosystem entry for the repo root, on the same weekly Monday schedule
as the other entries:

```yaml
  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
```

Dependabot's Docker support scans the configured directory for any file whose name
contains `Dockerfile`, so it picks up both `Dockerfile.dev` and `Dockerfile.contracts`
without listing them by name.

### Optional: keep Node on an LTS line

With a tag like `22-slim`, Dependabot can propose a jump to the next major version
(for example `24-slim`). To limit it to patch and minor updates within Node 22, and
bump the major by hand when the team chooses to:

```yaml
    ignore:
      - dependency-name: "node"
        update-types: ["version-update:semver-major"]
```

Leave Rust unrestricted. `rust:1.x-slim` minor bumps are the ones we want.

---

## What Dependabot does *not* cover here

The `docker` ecosystem only updates `FROM` lines. These pinned versions still need
manual bumps:

- **`stellar-cli@27.0.0`** in `Dockerfile.contracts` is installed with
  `cargo install`. It must stay in sync with the `stellar/stellar-cli` action
  version in `.github/workflows/ci.yml`, as the comment in the Dockerfile says. When
  Dependabot's `github-actions` entry bumps the CI action, bump the Dockerfile in the
  same PR.
- **`pnpm@latest`** in `Dockerfile.dev` (via corepack) is unpinned, so it changes
  without any PR. Consider pinning it to the `packageManager` field in
  `package.json`.
- **`wasm32v1-none`**: the Rust target is tied to the toolchain version, so it
  needs no separate update.

---

## Reviewing Docker update PRs

When a Dependabot PR bumps a base image:

1. **`rust` bump:** CI's contracts job builds with its own toolchain, not the image.
   Check locally with
   `docker compose build contracts && docker compose run --rm contracts build`.
   A new Rust minor can add Clippy lints or change wasm output size.
2. **`node` bump:** run
   `docker compose build frontend && docker compose up frontend` and load
   http://localhost:5173. Also start the backend profile
   (`docker compose --profile backend up indexer notifier`), because
   `better-sqlite3` is a native module and must build against the new Node ABI.

---

## Acceptance criteria

- [ ] `.github/dependabot.yml` has a `docker` entry for `/`.
- [ ] After merge, **Insights → Dependency graph → Dependabot** lists both
      Dockerfiles, and Dependabot opens update PRs for the base images.
