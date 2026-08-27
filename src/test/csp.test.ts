/**
 * CSP coverage test — vercel.json
 *
 * Parses the Content-Security-Policy header defined in vercel.json and asserts
 * that every domain the app actually contacts on mainnet/staging is present in
 * connect-src (or covered by the https: scheme-source wildcard).
 *
 * Run with: pnpm test src/test/csp.test.ts
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// ─── helpers ────────────────────────────────────────────────────────────────

interface VercelHeader {
  key: string
  value: string
}

interface VercelHeaderEntry {
  source: string
  headers: VercelHeader[]
}

interface VercelConfig {
  headers?: VercelHeaderEntry[]
}

/**
 * Load and parse vercel.json from the project root.
 */
function loadVercelConfig(): VercelConfig {
  const configPath = resolve(__dirname, "../../vercel.json")
  const raw = readFileSync(configPath, "utf-8")
  return JSON.parse(raw) as VercelConfig
}

/**
 * Extract the CSP header value from vercel.json.
 * Returns null if not found.
 */
function getCspHeaderValue(config: VercelConfig): string | null {
  for (const entry of config.headers ?? []) {
    for (const header of entry.headers) {
      if (header.key === "Content-Security-Policy") {
        return header.value
      }
    }
  }
  return null
}

/**
 * Parse a CSP directive value (space-separated list of sources) from a full
 * CSP header string. Returns an empty array if the directive is not present.
 */
function parseDirective(csp: string, directive: string): string[] {
  const re = new RegExp(`(?:^|;)\\s*${directive}\\s+([^;]+)`, "i")
  const match = re.exec(csp)
  if (!match) return []
  return match[1].trim().split(/\s+/)
}

// ─── required domains ───────────────────────────────────────────────────────

/**
 * Every origin the app can contact on mainnet or staging.
 *
 * For each entry the test checks that either:
 *   a) the origin itself appears verbatim in connect-src, or
 *   b) the naked "https:" scheme-source is present (covers arbitrary HTTPS
 *      hosts such as the stellar.toml fetches).
 *
 * "https:" itself is tested separately to confirm the wildcard is present.
 */
const REQUIRED_CONNECT_SRC_ORIGINS: string[] = [
  // Testnet RPC + Horizon (must always be kept)
  "https://soroban-testnet.stellar.org",
  "https://horizon-testnet.stellar.org",

  // Mainnet / staging RPC + Horizon (.env.mainnet and .env.staging)
  "https://soroban-mainnet.stellar.org",
  "https://horizon.stellar.org",

  // Token metadata — StellarExpert API (token-metadata.ts)
  "https://api.stellar.expert",

  // Token metadata — stellar.toml fetches to arbitrary HTTPS hosts
  // Verified by asserting the https: scheme-source wildcard is present.
  "https:",

  // Error tracking (Sentry event ingestion)
  "https://sentry.io",
  "https://o0.ingest.sentry.io",

  // Analytics (Plausible event endpoint)
  "https://plausible.io",
]

/**
 * External scripts loaded at runtime on mainnet/staging.
 */
const REQUIRED_SCRIPT_SRC_ORIGINS: string[] = [
  // Sentry SDK (dynamically injected in src/lib/sentry.ts)
  "https://browser.sentry-cdn.com",
  // Plausible analytics (dynamically injected in src/lib/analytics.ts)
  "https://plausible.io",
]

// ─── tests ──────────────────────────────────────────────────────────────────

describe("vercel.json Content-Security-Policy", () => {
  const config = loadVercelConfig()
  const csp = getCspHeaderValue(config)

  it("has a Content-Security-Policy header defined", () => {
    expect(csp).not.toBeNull()
    expect(typeof csp).toBe("string")
    expect((csp as string).length).toBeGreaterThan(0)
  })

  // ── connect-src ────────────────────────────────────────────────────────────

  describe("connect-src", () => {
    it("has a connect-src directive", () => {
      const sources = parseDirective(csp!, "connect-src")
      expect(sources.length).toBeGreaterThan(0)
    })

    it.each(REQUIRED_CONNECT_SRC_ORIGINS)(
      'allows "%s" (exact origin present, or covered by https: wildcard)',
      (origin) => {
        const sources = parseDirective(csp!, "connect-src")

        if (origin === "https:") {
          // The bare scheme-source must be present so arbitrary HTTPS hosts
          // (e.g. stellar.toml domains) are not blocked.
          expect(sources, "connect-src must contain the https: scheme-source").toContain("https:")
        } else {
          const covered = sources.includes(origin) || sources.includes("https:")
          expect(covered, `connect-src must contain "${origin}" or the "https:" scheme-source wildcard`).toBe(true)
        }
      },
    )
  })

  // ── script-src ─────────────────────────────────────────────────────────────

  describe("script-src", () => {
    it("has a script-src directive", () => {
      const sources = parseDirective(csp!, "script-src")
      expect(sources.length).toBeGreaterThan(0)
    })

    it.each(REQUIRED_SCRIPT_SRC_ORIGINS)('allows scripts from "%s"', (origin) => {
      const sources = parseDirective(csp!, "script-src")
      const covered = sources.includes(origin) || sources.includes("https:")
      expect(covered, `script-src must contain "${origin}" or the "https:" scheme-source wildcard`).toBe(true)
    })
  })

  // ── security baselines ─────────────────────────────────────────────────────

  describe("security baselines", () => {
    it("sets object-src 'none'", () => {
      expect(csp).toMatch(/object-src\s+'none'/)
    })

    it("sets frame-ancestors 'none'", () => {
      expect(csp).toMatch(/frame-ancestors\s+'none'/)
    })

    it("does not use a bare wildcard (*) in script-src", () => {
      const sources = parseDirective(csp!, "script-src")
      expect(sources).not.toContain("*")
    })
  })
})
