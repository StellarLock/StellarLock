# Issue #1135 — /api/health reports a meaningless version and always-unknown freighter status

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1135  
**Labels:** good first issue, backend  
**Difficulty:** Easy

---

## Problem

`api/health.ts` builds its response with two fields that are never meaningful in production:

```ts
// api/health.ts (current)
version: process.env.npm_package_version || "0.1.0",
dependencies: {
  rpc: rpc.status,
  horizon: horizon.status,
  freighter: "unknown" as const,
}
```

**`npm_package_version`** is injected by npm/pnpm when a script runs locally (e.g. `pnpm start`). Vercel does not set it, so the field always falls back to the hardcoded string `"0.1.0"` in production — the value is both stale and misleading.

**`freighter: "unknown"`** is hardcoded. Freighter is a browser wallet extension; it cannot be checked from a server-side function. The field looks informative in the health payload but cannot vary, so it adds noise without value.

---

## Context

The health handler is at `api/health.ts`. It checks RPC and Horizon reachability via `api/_lib/network-health.ts`, then returns:

```json
{
  "status": "ok",
  "service": "stellarlock-frontend",
  "environment": "production",
  "version": "0.1.0",
  "dependencies": {
    "rpc": "ok",
    "horizon": "ok",
    "freighter": "unknown"
  },
  "detail": { ... }
}
```

Vercel provides several build-time variables that identify the deployed commit:

| Variable | Value | Available at |
|----------|-------|-------------|
| `VERCEL_GIT_COMMIT_SHA` | Full 40-char commit SHA | Runtime (process.env) |
| `VERCEL_GIT_COMMIT_SHA` truncated | First 7 chars | Readable at runtime |
| `VERCEL_ENV` | `production` / `preview` / `development` | Runtime |

For non-Vercel deployments (self-hosted, Docker), a build-time variable injected via `vite define` or a `VERSION` env var is the equivalent.

---

## Task

1. Replace the `version` field with the actual deployed commit SHA (or a build-time tag).
2. Remove the `freighter` key from the `dependencies` object.

### Suggested implementation

```ts
// api/health.ts (after fix)
const version =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  process.env.VERSION ??
  'dev'

res.status(overallOk ? 200 : 503).json({
  status: overallOk ? 'ok' : 'degraded',
  service: 'stellarlock-frontend',
  environment: process.env.NODE_ENV || 'production',
  version,
  dependencies: {
    rpc: rpc.status,
    horizon: horizon.status,
    // freighter removed — cannot be checked server-side
  },
  detail: {
    rpc: rpc.detail,
    horizon: horizon.detail,
  },
})
```

`VERCEL_GIT_COMMIT_SHA` is set automatically by Vercel; no additional project configuration is needed. The `VERSION` fallback covers self-hosted deployments where operators can inject a release tag.

### Env var (optional, for self-hosted)

| Variable | Default | Description |
|----------|---------|-------------|
| `VERSION` | `'dev'` | Release identifier when `VERCEL_GIT_COMMIT_SHA` is not set |

---

## Acceptance Criteria

- [ ] `GET /api/health` returns a real commit SHA (or a non-hardcoded version identifier) in the `version` field
- [ ] The `freighter` key is absent from the `dependencies` object
- [ ] The existing test in `api/health.test.ts` is updated to reflect both changes

---

## Related

- `api/health.ts` — the handler to update
- `api/health.test.ts` — tests to update
- `api/_lib/network-health.ts` — RPC/Horizon check helpers (no changes needed)
