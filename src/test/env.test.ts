import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REQUIRED_ENV: Record<string, string> = {
  VITE_NETWORK: "TESTNET",
  VITE_RPC_URL: "https://soroban-testnet.stellar.org",
  VITE_HORIZON_URL: "https://horizon-testnet.stellar.org",
  VITE_CONTRACT_ENV: "testnet",
  VITE_CONTRACT_VERSION: "v1",
  VITE_TOKEN_LOCKER_CONTRACT: "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW",
  VITE_LP_LOCKER_CONTRACT: "CA3WYETNIF5IAF3VUNQ3SYKZFV45TOFBF7CEZ46I7QEBPWTRM73WLEI4",
}

function stubAllRequiredEnv(): void {
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    vi.stubEnv(key, value)
  }
  vi.stubEnv("VITE_APP_URL", "")
}

// env.ts validates at import time, so each test re-evaluates the module
// with a fresh set of stubbed env vars.
beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("env.ts", () => {
  describe("fail-fast validation", () => {
    it("throws at startup when a required env var is missing", async () => {
      stubAllRequiredEnv()
      vi.stubEnv("VITE_RPC_URL", "")

      await expect(import("@/lib/env")).rejects.toThrow("Missing required environment variables")
    })

    it("treats a whitespace-only value as missing", async () => {
      stubAllRequiredEnv()
      vi.stubEnv("VITE_HORIZON_URL", "   ")

      await expect(import("@/lib/env")).rejects.toThrow("Missing required environment variables")
    })

    it("lists every missing variable in the error message", async () => {
      stubAllRequiredEnv()
      vi.stubEnv("VITE_RPC_URL", "")
      vi.stubEnv("VITE_TOKEN_LOCKER_CONTRACT", "")

      let caught: unknown
      try {
        await import("@/lib/env")
      } catch (err) {
        caught = err
      }

      expect(caught).toBeInstanceOf(Error)
      const message = (caught as Error).message
      expect(message).toContain("VITE_RPC_URL")
      expect(message).toContain("VITE_TOKEN_LOCKER_CONTRACT")
      // Present vars are not listed
      expect(message).not.toContain("VITE_HORIZON_URL")
    })

    it("suggests copying an env template in the error message", async () => {
      stubAllRequiredEnv()
      vi.stubEnv("VITE_NETWORK", "")

      await expect(import("@/lib/env")).rejects.toThrow(/cp \.env\.testnet \.env/)
    })
  })

  describe("ENV mapping", () => {
    it("builds ENV from the validated variables", async () => {
      stubAllRequiredEnv()
      vi.stubEnv("VITE_APP_URL", "https://app.stellarlock.app")
      vi.stubEnv("DEV", false)

      const { ENV } = await import("@/lib/env")

      expect(ENV.network).toBe("testnet") // lowercased
      expect(ENV.rpcUrl).toBe(REQUIRED_ENV.VITE_RPC_URL)
      expect(ENV.horizonUrl).toBe(REQUIRED_ENV.VITE_HORIZON_URL)
      expect(ENV.contractEnv).toBe("testnet")
      expect(ENV.contractVersion).toBe("v1")
      expect(ENV.tokenLockerContract).toBe(REQUIRED_ENV.VITE_TOKEN_LOCKER_CONTRACT)
      expect(ENV.lpLockerContract).toBe(REQUIRED_ENV.VITE_LP_LOCKER_CONTRACT)
      expect(ENV.appUrl).toBe("https://app.stellarlock.app")
      expect(ENV.isDev).toBe(false)
    })

    it("defaults appUrl to an empty string when VITE_APP_URL is unset", async () => {
      stubAllRequiredEnv()

      const { ENV } = await import("@/lib/env")

      expect(ENV.appUrl).toBe("")
    })

    it("shows the env badge on staging even outside dev", async () => {
      stubAllRequiredEnv()
      vi.stubEnv("VITE_NETWORK", "staging")
      vi.stubEnv("DEV", false)

      const { ENV } = await import("@/lib/env")

      expect(ENV.network).toBe("staging")
      expect(ENV.showEnvBadge).toBe(true)
    })

    it("does not show the env badge on testnet outside dev", async () => {
      stubAllRequiredEnv()
      vi.stubEnv("VITE_NETWORK", "testnet")
      vi.stubEnv("DEV", false)

      const { ENV } = await import("@/lib/env")

      expect(ENV.showEnvBadge).toBe(false)
    })
  })
})
