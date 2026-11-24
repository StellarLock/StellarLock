import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  queryTokenLock,
  queryLpLock,
  queryLocksByToken,
  queryLockCountByToken,
  queryMyLocks,
  querySiteStats,
} from "@/lib/queryLocks"
import type { Lock, TokenLockSummary } from "@/types/lock"

const TOKEN_ADDR = "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW"
const OTHER_TOKEN = "CCCCCOTHERTOKENCONTRACTADDRESS00000000000000000000000000"
const CREATOR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
const OTHER_CREATOR = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const BENEFICIARY = "GD6ROJBYLKQMOW3E7N4M2YBPUHMZD7PL65VRHRMO24BOVSBV5H3BQRSL"

const {
  getLock,
  getLocksByToken,
  getLocksByCreator,
  getLocksByBeneficiary,
  getLockCountByCreator,
  getLockCountByBeneficiary,
  getLockCountByToken,
  getLpLock,
  getLpLocksByCreator,
  getLpLocksByBeneficiary,
  getLpLockCountByCreator,
  getLpLockCountByBeneficiary,
  fetchIndexerStats,
  fetchIndexerLocksForToken,
  mapIndexerLocks,
  mapIndexerLocksPageToSummary,
  fetchPricesBatch,
  getOnChainTokenMeta,
} = vi.hoisted(() => ({
  getLock: vi.fn(),
  getLocksByToken: vi.fn(),
  getLocksByCreator: vi.fn(),
  getLocksByBeneficiary: vi.fn(),
  getLockCountByCreator: vi.fn(),
  getLockCountByBeneficiary: vi.fn(),
  getLockCountByToken: vi.fn(),
  getLpLock: vi.fn(),
  getLpLocksByCreator: vi.fn(),
  getLpLocksByBeneficiary: vi.fn(),
  getLpLockCountByCreator: vi.fn(),
  getLpLockCountByBeneficiary: vi.fn(),
  fetchIndexerStats: vi.fn(),
  fetchIndexerLocksForToken: vi.fn(),
  mapIndexerLocks: vi.fn(),
  mapIndexerLocksPageToSummary: vi.fn(),
  fetchPricesBatch: vi.fn(),
  getOnChainTokenMeta: vi.fn(),
}))

vi.mock("@/lib/token-locker", () => ({
  getLock,
  getLocksByToken,
  getLocksByCreator,
  getLocksByBeneficiary,
  getLockCountByCreator,
  getLockCountByBeneficiary,
  getLockCountByToken,
}))

vi.mock("@/lib/lp-locker", () => ({
  getLpLock,
  getLpLocksByCreator,
  getLpLocksByBeneficiary,
  getLpLockCountByCreator,
  getLpLockCountByBeneficiary,
}))

vi.mock("@/lib/indexer-client", () => ({
  fetchIndexerStats,
  fetchIndexerLocksForToken,
  mapIndexerLocks,
  mapIndexerLocksPageToSummary,
}))

vi.mock("@/lib/prices", () => ({
  fetchPricesBatch,
}))

vi.mock("@/lib/token-metadata", () => ({
  getOnChainTokenMeta,
}))

function makeLock(overrides: Partial<Lock> = {}): Lock {
  return {
    id: "1",
    kind: "token",
    status: "locked",
    token: { address: TOKEN_ADDR, symbol: "TOK", name: "Token", decimals: 7 },
    creator: CREATOR,
    beneficiary: BENEFICIARY,
    amount: 100,
    usdValue: 0,
    createdAt: 1_700_000_000_000,
    unlockAt: 9_999_999_999_999,
    extendedCount: 0,
    ...overrides,
  }
}

function makeLpLock(overrides: Partial<Lock> = {}): Lock {
  return makeLock({ kind: "lp", dex: "aquarius", poolPair: [TOKEN_ADDR, "native"], ...overrides })
}

function makeSummary(locks: Lock[], overrides: Partial<TokenLockSummary> = {}): TokenLockSummary {
  return {
    token: locks[0].token,
    totalLocked: locks.reduce((s, l) => s + l.amount, 0),
    totalUsdValue: 0,
    activeLocks: locks.length,
    nextUnlockAt: null,
    locks,
    ...overrides,
  }
}

/** Resolve the price mock with a default map covering the shared token. */
function mockPrices(prices: Record<string, number> = { [TOKEN_ADDR]: 2 }) {
  fetchPricesBatch.mockResolvedValue(new Map(Object.entries(prices)))
}

describe("queryLocks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrices()
    getOnChainTokenMeta.mockResolvedValue({ symbol: "TOK", name: "Token", decimals: 7 })
  })

  // ── Single-lock queries ─────────────────────────────────────────────────────

  describe("queryTokenLock", () => {
    it("enriches a token lock with its USD value", async () => {
      getLock.mockResolvedValue(makeLock())
      const lock = await queryTokenLock("1")
      expect(lock).not.toBeNull()
      expect(lock!.id).toBe("1")
      expect(lock!.usdValue).toBe(200) // 2 USD × 100 tokens
      expect(fetchPricesBatch).toHaveBeenCalledWith([TOKEN_ADDR])
    })

    it("returns null and skips the price oracle when the lock does not exist", async () => {
      getLock.mockResolvedValue(null)
      expect(await queryTokenLock("999")).toBeNull()
      expect(fetchPricesBatch).not.toHaveBeenCalled()
    })
  })

  describe("queryLpLock", () => {
    it("enriches an LP lock with its USD value", async () => {
      getLpLock.mockResolvedValue(makeLpLock())
      const lock = await queryLpLock("2")
      expect(lock).not.toBeNull()
      expect(lock!.kind).toBe("lp")
      expect(lock!.usdValue).toBe(200)
    })

    it("returns null when the LP lock does not exist", async () => {
      getLpLock.mockResolvedValue(null)
      expect(await queryLpLock("999")).toBeNull()
    })
  })

  // ── Per-token queries ───────────────────────────────────────────────────────

  describe("queryLocksByToken", () => {
    it("prefers the indexer page when available and enriches with USD values", async () => {
      const locks = [makeLock({ id: "1" }), makeLock({ id: "2", amount: 50 })]
      fetchIndexerLocksForToken.mockResolvedValue({ total: 2, locks: [] })
      mapIndexerLocksPageToSummary.mockResolvedValue(makeSummary(locks))
      mockPrices({ [TOKEN_ADDR]: 3 })

      const summary = await queryLocksByToken(TOKEN_ADDR, 0, 50)

      expect(fetchIndexerLocksForToken).toHaveBeenCalledWith(TOKEN_ADDR, 0, 50)
      expect(getLocksByToken).not.toHaveBeenCalled() // indexer path won
      expect(summary).not.toBeNull()
      expect(summary!.locks.map((l) => l.usdValue)).toEqual([300, 150])
      expect(summary!.totalUsdValue).toBe(450)
    })

    it("falls back to direct RPC when the indexer is unavailable", async () => {
      const locks = [makeLock({ id: "1" })]
      fetchIndexerLocksForToken.mockResolvedValue(null)
      getLocksByToken.mockResolvedValue(makeSummary(locks))
      mockPrices({ [TOKEN_ADDR]: 4 })

      const summary = await queryLocksByToken(TOKEN_ADDR)

      expect(getLocksByToken).toHaveBeenCalledWith(TOKEN_ADDR, 0, 50)
      expect(summary!.locks[0].usdValue).toBe(400)
      expect(summary!.totalUsdValue).toBe(400)
    })

    it("falls back to direct RPC when the indexer page holds no token-kind locks", async () => {
      fetchIndexerLocksForToken.mockResolvedValue({ total: 1, locks: [] })
      mapIndexerLocksPageToSummary.mockResolvedValue(null) // only LP rows in the page
      getLocksByToken.mockResolvedValue(makeSummary([makeLock({ id: "1" })]))

      const summary = await queryLocksByToken(TOKEN_ADDR)

      expect(getLocksByToken).toHaveBeenCalled()
      expect(summary!.locks[0].id).toBe("1")
    })

    it("returns null when both tiers report no data", async () => {
      fetchIndexerLocksForToken.mockResolvedValue(null)
      getLocksByToken.mockResolvedValue(null)
      expect(await queryLocksByToken(TOKEN_ADDR)).toBeNull()
    })
  })

  describe("queryLockCountByToken", () => {
    it("uses the indexer's DB-level total when available", async () => {
      fetchIndexerLocksForToken.mockResolvedValue({ total: 7, locks: [] })
      expect(await queryLockCountByToken(TOKEN_ADDR)).toBe(7)
      expect(getLockCountByToken).not.toHaveBeenCalled()
    })

    it("falls back to the on-chain count when the indexer is unavailable", async () => {
      fetchIndexerLocksForToken.mockResolvedValue(null)
      getLockCountByToken.mockResolvedValue(3)
      expect(await queryLockCountByToken(TOKEN_ADDR)).toBe(3)
    })
  })

  // ── Per-user queries ────────────────────────────────────────────────────────

  describe("queryMyLocks", () => {
    it("combines created and received locks across token and lp lockers, enriched with USD", async () => {
      const created = [makeLock({ id: "1" }), makeLpLock({ id: "2", amount: 10 })]
      const received = [makeLock({ id: "3", creator: OTHER_CREATOR }), makeLpLock({ id: "4", creator: OTHER_CREATOR })]
      getLocksByCreator.mockResolvedValue([created[0]])
      getLpLocksByCreator.mockResolvedValue([created[1]])
      getLocksByBeneficiary.mockResolvedValue([received[0]])
      getLpLocksByBeneficiary.mockResolvedValue([received[1]])
      getLockCountByCreator.mockResolvedValue(1)
      getLpLockCountByCreator.mockResolvedValue(1)
      getLockCountByBeneficiary.mockResolvedValue(1)
      getLpLockCountByBeneficiary.mockResolvedValue(1)

      const result = await queryMyLocks(CREATOR, 0, 50)

      expect(result.created.map((l) => l.id)).toEqual(["1", "2"])
      expect(result.received.map((l) => l.id)).toEqual(["3", "4"])
      expect(result.totalCreated).toBe(2)
      expect(result.totalReceived).toBe(2)
      // USD enrichment applied to both lists (2 USD per token unit)
      expect(result.created[0].usdValue).toBe(200)
      expect(result.received[0].usdValue).toBe(200)
    })

    it("excludes locks the address created itself from the received list (edge case)", async () => {
      const selfCreated = makeLock({ id: "1", creator: CREATOR }) // also appears as a received lock
      const external = makeLock({ id: "2", creator: OTHER_CREATOR })
      getLocksByCreator.mockResolvedValue([selfCreated])
      getLpLocksByCreator.mockResolvedValue([])
      getLocksByBeneficiary.mockResolvedValue([selfCreated, external])
      getLpLocksByBeneficiary.mockResolvedValue([])
      getLockCountByCreator.mockResolvedValue(1)
      getLpLockCountByCreator.mockResolvedValue(0)
      getLockCountByBeneficiary.mockResolvedValue(2)
      getLpLockCountByBeneficiary.mockResolvedValue(0)

      const result = await queryMyLocks(CREATOR)

      expect(result.created.map((l) => l.id)).toEqual(["1"])
      expect(result.received.map((l) => l.id)).toEqual(["2"])
      expect(result.totalReceived).toBe(2) // count comes from the contract, not the filtered list
    })
  })

  // ── Site-wide stats ─────────────────────────────────────────────────────────

  describe("querySiteStats", () => {
    it("returns an empty, correctly-shaped fallback when the indexer is unavailable", async () => {
      fetchIndexerStats.mockResolvedValue(null)
      const stats = await querySiteStats()
      expect(stats).toEqual({
        source: "fallback",
        totalLocks: 0,
        totalValueLocked: 0,
        uniqueTokens: 0,
        recentLocks: [],
        upcomingUnlocks: [],
        tokenGroups: [],
      })
    })

    it("builds indexer-backed stats with token groups, prices and enriched locks", async () => {
      fetchIndexerStats.mockResolvedValue({
        totalLocks: 10,
        totalValue: "1000",
        uniqueTokens: 2,
        recentLocks: [{ id: "1" }],
        upcomingUnlocks: [{ id: "2" }],
        topTokens: [
          { token: TOKEN_ADDR, lockCount: 5, totalLocked: "1000000000" }, // 100 tokens @7dp
          { token: OTHER_TOKEN, lockCount: 3, totalLocked: "2000000000" }, // 200 tokens @7dp
        ],
      })
      mapIndexerLocks.mockImplementation((rows: { id: string }[]) =>
        Promise.resolve(rows.map((row) => makeLock({ id: row.id }))),
      )
      mockPrices({ [TOKEN_ADDR]: 2, [OTHER_TOKEN]: 3 })

      const stats = await querySiteStats()

      expect(stats.source).toBe("indexer")
      expect(stats.totalLocks).toBe(10)
      expect(stats.uniqueTokens).toBe(2)
      expect(stats.recentLocks.map((l) => l.id)).toEqual(["1"])
      expect(stats.upcomingUnlocks.map((l) => l.id)).toEqual(["2"])
      expect(stats.recentLocks[0].usdValue).toBe(200) // enriched
      expect(stats.tokenGroups).toHaveLength(2)
      expect(stats.tokenGroups[0].token.symbol).toBe("TOK")
      expect(stats.tokenGroups[0].count).toBe(5)
      // 100 tokens × 2 USD
      expect(stats.tokenGroups[0].totalValue).toBe(200)
      // 200 tokens × 3 USD
      expect(stats.tokenGroups[1].totalValue).toBe(600)
      expect(stats.totalValueLocked).toBe(800)
    })
  })
})
