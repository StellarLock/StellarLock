# Issue #982 — Document frontend environment variables missing from `.env.example`

**GitHub:** https://github.com/StellarLock/StellarLock/issues/982  
**Status:** Resolved in PR #1006  
**Area:** `.env.example`

---

## Problem

Three `VITE_*` variables used in `src/` were absent from `.env.example`, the canonical
reference for contributors and deployment engineers:

| Variable | Used in |
|---|---|
| `VITE_LOG_LEVEL` | `src/lib/logger.ts` |
| `VITE_API_BASE` | `src/hooks/useNotifications.ts` |
| `VITE_PLAUSIBLE_INTEGRITY` | `src/lib/analytics.ts` |

Anyone setting up the project from `.env.example` had no hint that these variables existed,
leading to silent defaults or unexpected behaviour (e.g. log spam in production, broken
notification subscriptions, missing CSP integrity hash on the analytics script).

---

## Variables added

### `VITE_LOG_LEVEL`

**Source:** `src/lib/logger.ts`

Controls the minimum severity level for the in-browser structured logger.

Accepted values: `debug` | `info` | `warn` | `error`

Default behaviour if unset:
- `debug` in development (`import.meta.env.DEV === true`)
- `warn` in production

```
# Optional: override the browser logger minimum level (debug | info | warn | error).
# Defaults to "debug" in dev and "warn" in production.
# VITE_LOG_LEVEL=warn
```

### `VITE_API_BASE`

**Source:** `src/hooks/useNotifications.ts`

Base URL for the StellarLock serverless notification API
(`/api/notifications/subscribe`, `/api/notifications/unsubscribe`).

When unset, the value defaults to `""` (empty string), which means the requests are sent
relative to the page origin. This is correct for same-origin deployments but must be
set explicitly when the API is hosted on a different origin (e.g. a separate Vercel
deployment).

```
# Optional: base URL for the notifications API.
# Leave blank to use the same origin as the frontend.
# VITE_API_BASE=https://api.stellarlock.xyz
```

### `VITE_PLAUSIBLE_INTEGRITY`

**Source:** `src/lib/analytics.ts`

Subresource Integrity (SRI) hash for the Plausible Analytics script tag. When set, it is
applied as the `integrity` attribute on the dynamically injected `<script>` element,
enabling CSP `require-sri-for script` enforcement.

When unset the `integrity` attribute is set to an empty string (i.e. no SRI check is
performed).

The correct value is the `sha256-...` hash published on the
[Plausible self-hosting releases page](https://github.com/plausible/analytics/releases)
for the version of the script you are serving.

```
# Optional: SRI hash for the Plausible analytics script (enables CSP require-sri-for).
# VITE_PLAUSIBLE_INTEGRITY=sha256-<base64>
```

---

## Complete `.env.example` optional section after fix

```dotenv
# Optional:
#   VITE_PLAUSIBLE_DOMAIN         Your site domain as registered in Plausible
#   VITE_PLAUSIBLE_API_HOST       Plausible API host (default: https://plausible.io)
#   VITE_PLAUSIBLE_INTEGRITY      SRI hash for the Plausible script tag
#   VITE_SENTRY_DSN               Sentry DSN for error reporting
#   VITE_APP_URL                  Canonical public URL (used for og:url and sharing links)
#   VITE_LOG_LEVEL                Browser logger minimum level: debug | info | warn | error
#   VITE_API_BASE                 Base URL for the notifications API (blank = same origin)
```

---

## Full variable reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_NETWORK` | ✅ | — | `testnet` \| `staging` \| `mainnet` |
| `VITE_RPC_URL` | ✅ | — | Soroban RPC endpoint |
| `VITE_HORIZON_URL` | ✅ | — | Horizon REST endpoint |
| `VITE_TOKEN_LOCKER_CONTRACT` | ✅ | — | Token locker contract address |
| `VITE_LP_LOCKER_CONTRACT` | ✅ | — | LP locker contract address |
| `VITE_CONTRACT_ENV` | ✅ | — | `testnet` \| `mainnet` — selects registry.json addresses |
| `VITE_CONTRACT_VERSION` | ✅ | — | e.g. `v1` |
| `VITE_PLAUSIBLE_DOMAIN` | ☐ | — | Site domain registered in Plausible |
| `VITE_PLAUSIBLE_API_HOST` | ☐ | `https://plausible.io` | Plausible API host |
| `VITE_PLAUSIBLE_INTEGRITY` | ☐ | `""` (no SRI check) | SRI hash for Plausible script |
| `VITE_SENTRY_DSN` | ☐ | — | Sentry DSN for error reporting |
| `VITE_APP_URL` | ☐ | `""` | Canonical public URL |
| `VITE_LOG_LEVEL` | ☐ | `debug` (dev) / `warn` (prod) | Browser logger minimum level |
| `VITE_API_BASE` | ☐ | `""` (same origin) | Base URL for the notifications API |
