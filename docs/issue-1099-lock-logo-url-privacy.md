# Issue #1099 — Lock metadata `logo_url` loads arbitrary third-party images on LockDetail

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1099  
**Status:** Open  
**Area:** `src/pages/LockDetail.tsx`, `src/components/locks/CreateLpLockForm.tsx`, `vercel.json`

---

## Problem

A lock creator sets `LockMetadata.logo_url` when creating the lock. It is stored
on-chain unchanged, and `LockDetail.tsx` renders it directly:

```tsx
{lock.metadata.logoUrl && (
  <img src={lock.metadata.logoUrl} alt={t("lockDetail.projectLogoAlt")} … />
)}
```

The CSP in `vercel.json` allows `img-src 'self' data: https:`, so the browser loads any
HTTPS image the creator chooses.

### Impact

- **Tracking pixel.** The creator controls the image server, so every visit to the lock
  page sends them the viewer's IP address, User-Agent, and the time of the visit. For a
  team or investor lock, this shows who is checking the lock and when.
  `Referrer-Policy: strict-origin-when-cross-origin` already strips the path, so the
  referrer reveals only that the visitor came from StellarLock, not which lock.
  Requests should still send no referrer at all.
- **Misleading imagery.** The image appears inside StellarLock's own "Lock details"
  card. A creator can use a well-known project's logo, or an image of text such as
  "Verified ✓", which makes the lock look more trustworthy than it is.
- **Non-HTTPS values.** CSP blocks `http:`, `javascript:`, `blob:` and similar schemes,
  but `data:` is allowed. A `data:` value is rendered too, and this lets someone embed
  arbitrary imagery with no network request.

---

## Proposed fix

### 1. URL validation helper

Add `src/lib/validation/safe-image-url.ts`:

```ts
/** Returns the URL string if it is an absolute https: URL, otherwise null. */
export function safeImageUrl(raw: string | undefined | null): string | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  if (url.username || url.password) return null // no credentials in URL
  return url.toString()
}
```

The helper rejects:

| Input                                   | Result |
|-----------------------------------------|--------|
| `https://proj.xyz/logo.png`             | allowed |
| `http://proj.xyz/logo.png`              | `null` |
| `data:image/svg+xml;…`                  | `null` |
| `javascript:…`, `blob:…`, `ftp:…`        | `null` |
| `//proj.xyz/logo.png`, `/logo.png`, `logo.png` | `null` (relative) |
| `https://user:pass@proj.xyz/x.png`      | `null` |
| empty / whitespace / malformed          | `null` |

Use the same helper in `CreateLpLockForm.tsx`, and in the token lock form if it has a
logo field, so creators get an inline error instead of a logo that never appears.

### 2. Rendering

```tsx
const logo = safeImageUrl(lock.metadata.logoUrl)
{logo && (
  <img
    src={logo}
    referrerPolicy="no-referrer"
    loading="lazy"
    decoding="async"
    crossOrigin="anonymous"
    …
  />
)}
```

- `referrerPolicy="no-referrer"` sends no `Referer` header at all.
- `loading="lazy"` defers the request until the card scrolls into view, so a visitor who
  only reads the top of the page never contacts the creator's server.
- `crossOrigin="anonymous"` keeps cookies for the image host out of the request.

### 3. Click-to-load (recommended)

Lazy loading still contacts the creator's server for anyone who scrolls down. To stop
that entirely, show a neutral placeholder (initials or a generic icon) with a **"Load
project logo"** button. Pressing it loads the image from the creator's host, which is
named in the button's tooltip. Optionally remember the choice per host in
`localStorage`, and add the key to [browser-storage.md](./browser-storage.md).

**Alternative: image proxy.** An `/api/image-proxy?url=` function could fetch, size-cap
and re-serve the image from our own origin, which hides the viewer's IP from the
creator. This costs more. The function needs protection against requests to internal
or private addresses (SSRF), content-type checks, size limits and caching, and it
moves bandwidth cost to us. Consider it only if click-to-load turns out to be too much
friction.

### 4. CSP

Once logos are restricted to `https:`, `data:` in `img-src` is only needed for our own
inline assets, such as the badge SVG in `LockBadge.tsx`. Leave `img-src` as it is for
now. Token logos from `stellar.toml` (`src/lib/token-metadata.ts`) also need arbitrary
HTTPS image hosts. Keep this fix to the lock logo, and track token logos separately if
they should get the same treatment.

---

## Documentation to update

- [security-audit.md](./security-audit.md): add "creator-controlled metadata URLs" to the
  frontend threat model, with the mitigations above.
- `CreateLpLockForm` help text: "Logo must be an https:// URL. Viewers may need to click
  to load it."

---

## Tests

`src/lib/validation/safe-image-url.test.ts` covers every row of the table above.

LockDetail component tests cover:

- An `https:` logo renders with `referrerpolicy="no-referrer"` and `loading="lazy"`.
- A non-`https:` logo renders no `<img>` (and the card still shows when description or
  project URL is present).
- With click-to-load, no `<img>` exists until the button is pressed.

---

## Acceptance criteria

- [ ] Non-`https:` logo URLs are rejected, both in the form and at render time.
- [ ] Logo images load with `referrerPolicy="no-referrer"` and `loading="lazy"`.
- [ ] Unit tests cover URL validation.
- [ ] The behaviour is documented in `security-audit.md`.
