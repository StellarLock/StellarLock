# Issue #1132 — Add rate limiting to notification API endpoints

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1132  
**Labels:** security, backend  
**Difficulty:** Medium

---

## Problem

The three notification endpoints — `POST /api/notifications/subscribe`, `DELETE /api/notifications/unsubscribe`, and `GET /api/notifications/subscriptions` — have no per-IP or per-address request limits. Two attack paths follow:

1. **DB flooding.** A script can call `subscribe` in a tight loop under many lock IDs or addresses and grow `notification_subscriptions` without bound.
2. **Webhook probing.** Each `subscribe` call that includes a `webhookUrl` triggers DNS resolution inside `validateWebhookUrl` (in `indexer/ssrf.ts`). An attacker can use this to probe internal hostnames via DNS side-channels, even if the actual connection is blocked.

---

## Context

The API lives in three Vercel serverless functions under `api/notifications/`:

| File | Endpoint |
|------|----------|
| `api/notifications/subscribe.ts` | `POST /api/notifications/subscribe` |
| `api/notifications/unsubscribe.ts` | `DELETE /api/notifications/unsubscribe` |
| `api/notifications/subscriptions.ts` | `GET /api/notifications/subscriptions` |

Each handler calls `initDb()` on every invocation and writes to (or reads from) the shared `notification_subscriptions` SQLite table in `indexer/db.ts`. Vercel functions run as isolated instances with ephemeral filesystems, so rate-limit state cannot be stored in-process memory.

---

## Task

Add a lightweight rate limiter that returns `429 Too Many Requests` when a caller exceeds the configured threshold. The limits must be configurable via environment variables so they can be tuned without a code deploy.

### Recommended approaches

**Option A — Upstash Redis / Vercel KV (preferred for production)**  
Upstash Redis has a free tier and a native Vercel integration. A sliding-window counter keyed on `ratelimit:<endpoint>:<ip_or_address>` works well. The [`@upstash/ratelimit`](https://github.com/upstash/ratelimit) package provides a one-call API:

```ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(
    Number(process.env.NOTIFICATION_RATE_LIMIT_MAX ?? 20),
    `${process.env.NOTIFICATION_RATE_LIMIT_WINDOW_S ?? 60}s`,
  ),
})

// In handler:
const { success } = await ratelimit.limit(`subscribe:${address}`)
if (!success) return res.status(429).json({ error: 'rate limit exceeded' })
```

Required env vars (add to `.env.example`): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

**Option B — In-DB token bucket**  
Add a `rate_limit_buckets` table to `indexer/db.ts`. On each request, run a single atomic `UPDATE … RETURNING` that decrements the bucket and refills it if the window has elapsed. No new infrastructure required; works for self-hosted deployments; not safe across concurrent Vercel function instances unless the DB is a networked one (see [Issue #1134](https://github.com/StellarLock/StellarLock/issues/1134)).

### Suggested env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTIFICATION_RATE_LIMIT_MAX` | `20` | Maximum requests allowed per window per address |
| `NOTIFICATION_RATE_LIMIT_WINDOW_S` | `60` | Window duration in seconds |

Limits should apply per Stellar address for `subscribe`/`subscriptions`, and per IP for all three endpoints as a secondary backstop.

---

## Acceptance Criteria

- [ ] Excess requests receive `429` with a JSON body `{ "error": "rate limit exceeded" }`
- [ ] Limits are configurable via environment variables without a code change
- [ ] New env vars are documented in `.env.example`
- [ ] Unit tests cover the 429 path (mock the rate-limit backend)

---

## Related

- [Issue #1133](https://github.com/StellarLock/StellarLock/issues/1133) — subscription pruning (reduces DB growth independently)
- [Issue #1134](https://github.com/StellarLock/StellarLock/issues/1134) — shared DB (Option B above requires this for Vercel deployments)
- [ADR-010](./adr/ADR-010-rate-limit-via-temporary-storage.md) — on-chain rate limiting (contract level, different layer)
- `indexer/ssrf.ts` — webhook URL validation called at subscribe time
