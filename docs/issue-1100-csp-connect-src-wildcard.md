# Issue #1100 — CSP `connect-src` ends with a bare `https:` that permits any origin

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1100  
**Status:** Open  
**Area:** `vercel.json`, `src/lib/token-metadata.ts`, `.env.example`

---

## Problem

The `Content-Security-Policy` header in `vercel.json` lists specific hosts in
`connect-src` and then ends with a bare scheme:

```
connect-src 'self'
  https://soroban-testnet.stellar.org https://horizon-testnet.stellar.org
  https://soroban-rpc.mainnet.stellar.gateway.fm https://soroban-mainnet.stellar.org
  https://horizon.stellar.org https://api.stellar.expert
  https://sentry.io https://o0.ingest.sentry.io https://plausible.io
  https:
```

`https:` matches every HTTPS origin, so the host list has no effect. If a script were
injected through XSS or a compromised dependency, it could `fetch()` wallet addresses,
signed transaction XDR or other page data to any server. `connect-src` is the
directive that is supposed to block that.

---

## What actually needs network access

These are all the places the frontend calls `fetch` or the SDK opens a connection:

| Caller                                 | Host(s)                                           | In allowlist? |
|----------------------------------------|---------------------------------------------------|---------------|
| `src/lib/stellar.ts` (Soroban RPC)     | `VITE_RPC_URL`; defaults are in the list          | defaults only |
| `src/lib/stellar.ts`, `prices.ts` (Horizon) | `VITE_HORIZON_URL`; defaults are in the list | defaults only |
| `src/lib/indexer-client.ts`            | `/api/*` (same origin)                            | yes (`'self'`) |
| `src/lib/token-metadata.ts`            | `https://api.stellar.expert`                      | yes |
| `src/lib/token-metadata.ts` → `fetchFromStellarToml` | `https://<asset home_domain>/.well-known/stellar.toml` | **no, any domain** |
| `src/lib/sentry.ts`                    | ingest host from `VITE_SENTRY_DSN` (e.g. `o123456.ingest.us.sentry.io`) | only the placeholder `o0` |
| `src/lib/analytics.ts`                 | `VITE_PLAUSIBLE_API_HOST` (default `plausible.io`) | default only |

The `stellar.toml` lookup is the blocker. It fetches from whatever `home_domain` an
asset issuer has set, so no fixed list can cover it. Removing `https:` without dealing
with it breaks token names and logos for assets that `stellar.expert` doesn't describe
fully.

---

## Proposed fix

### 1. Route `stellar.toml` through our own origin

Add `api/stellar-toml.ts`:

- `GET /api/stellar-toml?domain=<home_domain>`
- Check that `domain` is a public DNS name: no IP literals, no `localhost`, no ports,
  and no internal or private addresses after DNS resolution, to prevent server-side
  request forgery (SSRF).
- Fetch `https://<domain>/.well-known/stellar.toml` with a 5 s timeout, a 100 KB body
  cap, and no redirects to other hosts.
- Return the raw TOML (`text/plain`) with `Cache-Control: public, s-maxage=3600`.

Then change `fetchFromStellarToml` to call `/api/stellar-toml?domain=…`, which `'self'`
already covers. A side benefit is that viewers' IP addresses are no longer sent to
issuer domains.

If the proxy is out of scope for this issue, the minimal alternative is to drop the
direct `stellar.toml` fetch and rely on `api.stellar.expert` only. Token metadata gets
slightly worse, and the policy is still strict.

### 2. Tighten the policy

```
connect-src 'self'
  https://soroban-testnet.stellar.org https://horizon-testnet.stellar.org
  https://soroban-mainnet.stellar.org https://soroban-rpc.mainnet.stellar.gateway.fm
  https://horizon.stellar.org
  https://api.stellar.expert
  https://*.ingest.sentry.io https://*.ingest.us.sentry.io
  https://plausible.io
```

- Remove the trailing `https:`.
- Replace `https://o0.ingest.sentry.io` (a placeholder that matches no real DSN) with
  the ingest wildcards. Also remove `https://sentry.io` unless something calls it
  directly.
- Leave `img-src` unchanged here. Image handling is covered by
  [issue #1099](./issue-1099-lock-logo-url-privacy.md).

### 3. Custom RPC / Horizon / analytics hosts

`vercel.json` is static, so it cannot read `VITE_RPC_URL`. A deployment that points at
a custom RPC provider has to add that host to `connect-src` by hand. Make that hard to
miss:

- Add a comment block in `.env.example` next to `VITE_RPC_URL`, `VITE_HORIZON_URL`,
  `VITE_PLAUSIBLE_API_HOST` and `VITE_SENTRY_DSN`: *"If you change this host, add it to
  `connect-src` in `vercel.json`."*
- Optionally, add a `scripts/check-csp.ts` CI step that parses `vercel.json` and fails
  when the origin of any configured `VITE_*_URL` is not in `connect-src`. It should also
  fail if a bare `https:`, `http:` or `*` comes back.

---

## How to extend the policy (for docs/deploying-backend.md / README)

1. Find the exact origin the app needs, as scheme + host (+ port). Examples:
   `https://rpc.example.com`, or `https://*.example.com` for a provider with regional
   subdomains.
2. Add it to the `connect-src` list in `vercel.json`. Never add a bare scheme
   (`https:`) or `*`.
3. Deploy a preview and check the browser console for
   `Refused to connect to … because it violates … connect-src`.
4. Note in the PR why the host is needed.

---

## Verification

Run the following on preview deployments with both configurations:

| Config                         | Check                                                                   |
|--------------------------------|-------------------------------------------------------------------------|
| `VITE_NETWORK=testnet`         | connect wallet, create lock, LockDetail, Explorer search, Analytics, Health |
| `VITE_NETWORK=mainnet`         | same pages, read-only                                                   |
| both                           | no `connect-src` violations in the console; Sentry test event arrives; Plausible pageview arrives |
| both                           | a token whose metadata comes from `stellar.toml` still shows name and logo |

Quick check from the console that the policy now blocks unknown hosts:

```js
fetch("https://example.com") // should reject with a CSP violation
```

---

## Acceptance criteria

- [ ] `connect-src` has no wildcard scheme (`https:`, `http:`, `*`).
- [ ] The `stellar.toml` lookup goes through a same-origin proxy (or is removed).
- [ ] The app works on testnet and mainnet configs with no CSP violations.
- [ ] How to extend the allowlist is documented, and `.env.example` points to it.
