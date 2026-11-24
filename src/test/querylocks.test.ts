import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockLock, mockLpLock, VALID_PUBLIC_KEY, VALID_CONTRACT_ADDRESS } from "./mocks"
import type { Lock, TokenLockSummary } from "@/types/lock"
import type { IndexerStatsDTO } from "@/lib/indexer-client"

const mocks = vi.hoisted(() => ({
  // @/lib/token-locker
  getLock: vi.fn(),
  getLocksByToken: vi.fn(),
  getLocksByCreator: vi.fn(),
  getLocksByBeneficiary: vi.fn(),
  getLockCountByToken: vi.fn(),
  getLockCountByCreator: vi.fn(),
  getLockCountByBeneficiary: vi.fn(),
  // @/lib/lp-locker
  getLpLock: vi.fn(),
  getLpLocksByCreator: vi.fn(),
  getLpLocksByBeneficiary: vi.fn(),
  getLpLockCountByCreator: vi.fn(),
  getLpLockCountByBeneficiary: vi.fn(),
  // @/lib/indexer-client
  fetchIndexerStats: vi.fn(),
  fetchIndexerLocksForToken: vi.fn(),
  mapIndexerLocks: vi.fn(),
  mapIndexerLocksPageToSummary: vi.fn(),
  // @/lib/prices
  fetchPricesBatch: vi.fn(),
  // @/lib/token-metadata
  getOnChainTokenMeta: vi.fn(),
}))

vi.mock("@/lib/token-locker", () => ({
  getLock: mocks.getLock,
  getLocksByToken: mocks.getLocksByToken,
  getLocksByCreator: mocks.getLocksByCreator,
  getLocksByBeneficiary: mocks.getLocksByBeneficiary,
  getLockCountByToken: mocks.getLockCountByToken,
  getLockCountByCreator: mocks.getLockCountByCreator,
  getLockCountByBeneficiary: mocks.getLockCountByBeneficiary,
}))

vi.mock("@/lib/lp-locker", () => ({
  getLpLock: mocks.getLpLock,
  getLpLocksByCreator: mocks.getLpLocksByCreator,
  getLpLocksByBeneficiary: mocks.getLpLocksByBeneficiary,
  getLpLockCountByCreator: mocks.getLpLockCountByCreator,
  getLpLockCountByBeneficiary: mocks.getLpLockCountByBeneficiary,
}))

vi.mock("@/lib/indexer-client", () => ({
  fetchIndexerStats: mocks.fetchIndexerStats,
  fetchIndexerLocksForToken: mocks.fetchIndexerLocksForToken,
  mapIndexerLocks: mocks.mapIndexerLocks,
  mapIndexerLocksPageToSummary: mocks.mapIndexerLocksPageToSummary,
}))

vi.mock("@/lib/prices", () => ({ fetchPricesBatch: mocks.fetchPricesBatch }))

vi.mock("@/lib/token-metadata", () => ({ getOnChainTokenMeta: mocks.getOnChainTokenMeta }))

import {
  queryTokenLock,
  queryLpLock,
  queryLocksByToken,
  queryLockCountByToken,
  queryMyLocks,
  querySiteStats,
} from "@/lib/queryLocks"

function resetAll() {
  for (const fn of Object.values(mocks)) fn.mockReset()
}

const OTHER_KEY = "GDOVFVJ7UAEDONL7QONMBTZAH7VQA4ALSPVNGMHOH7BFPDZ2P7S7EQUAST"

function summary(overrides: Partial<TokenLockSummary> = {}): TokenLockSummary {
  return {
    token: mockLock.token,
    totalLocked: 100,
    totalUsdValue: 0,
    activeLocks: 1,
    nextUnlockAt: mockLock.unlockAt,
    locks: [mockLock],
    ...overrides,
  }
}

describe("queryTokenLock / queryLpLock", () => {
  beforeEach(() => {
    resetAll()
    mocks.fetchPricesBatch.mockResolvedValue(new Map([[VALID_CONTRACT_ADDRESS, 2]]))
  })

  it("returns null when the lock does not exist on-chain", async () => {
    mocks.getLock.mockResolvedValue(null)
    expect(await queryTokenLock("99")).toBeNull()
  })

  it("enriches a token lock with a USD value from the price oracle", async () => {
    mocks.getLock.mockResolvedValue(mockLock)
    const lock = await queryTokenLock("1")
    expect(lock?.usdValue).toBe(2 * mockLock.amount)
    expect(mocks.fetchPricesBatch).toHaveBeenCalledWith([VALID_CONTRACT_ADDRESS])
  })

  it("enriches an LP lock via the LP path", async () => {
    mocks.getLpLock.mockResolvedValue(mockLpLock)
    mocks.fetchPricesBatch.mockResolvedValue(new Map([[mockLpLock.token.address, 3]]))
    const lock = await queryLpLock("2")
    expect(lock?.usdValue).toBe(3 * mockLpLock.amount)
    expect(mocks.getLpLock).toHaveBeenCalledWith("2")
  })

  it("returns null for a missing LP lock", async () => {
    mocks.getLpLock.mockResolvedValue(null)
    expect(await queryLpLock("2")).toBeNull()
  })
})

describe("queryLocksByToken", () => {
  beforeEach(() => {
    resetAll()
    mocks.fetchPricesBatch.mockResolvedValue(new Map([[VALID_CONTRACT_ADDRESS, 2]]))
  })

  it("prefers the indexer page but still enriches with USD values", async () => {
    mocks.fetchIndexerLocksForToken.mockResolvedValue({ total: 1, locks: [] })
    mocks.mapIndexerLocksPageToSummary.mockResolvedValue(summary())

    const out = await queryLocksByToken(VALID_CONTRACT_ADDRESS)

    expect(mocks.mapIndexerLocksPageToSummary).toHaveBeenCalled()
    expect(mocks.getLocksByToken).not.toHaveBeenCalled()
    expect(out?.locks[0].usdValue).toBe(2 * mockLock.amount)
    expect(out?.totalUsdValue).toBe(2 * mockLock.amount)
  })

  it("falls back to direct RPC when the indexer page is unavailable", async () => {
    mocks.fetchIndexerLocksForToken.mockResolvedValue(null)
    mocks.getLocksByToken.mockResolvedValue(summary())

    const out = await queryLocksByToken(VALID_CONTRACT_ADDRESS)

    expect(mocks.getLocksByToken).toHaveBeenCalledWith(VALID_CONTRACT_ADDRESS, 0, 50)
    expect(out?.locks).toHaveLength(1)
  })

  it("falls back to direct RPC when the indexer summary maps to nothing", async () => {
    mocks.fetchIndexerLocksForToken.mockResolvedValue({ total: 0, locks: [] })
    mocks.mapIndexerLocksPageToSummary.mockResolvedValue(null)
    mocks.getLocksByToken.mockResolvedValue(summary())

    const out = await queryLocksByToken(VALID_CONTRACT_ADDRESS)
    expect(mocks.getLocksByToken).toHaveBeenCalled()
    expect(out?.locks).toHaveLength(1)
  })

  it("returns null when neither tier yields locks", async () => {
    mocks.fetchIndexerLocksForToken.mockResolvedValue(null)
    mocks.getLocksByToken.mockResolvedValue(null)
    expect(await queryLocksByToken(VALID_CONTRACT_ADDRESS)).toBeNull()
  })
})

describe("queryLockCountByToken", () => {
  beforeEach(() => resetAll())

  it("prefers the indexer total when available", async () => {
    mocks.fetchIndexerLocksForToken.mockResolvedValue({ total: 42, locks: [] })
    expect(await queryLockCountByToken(VALID_CONTRACT_ADDRESS)).toBe(42)
    expect(mocks.getLockCountByToken).not.toHaveBeenCalled()
  })

  it("falls back to the chain count when the indexer is unavailable", async () => {
    mocks.fetchIndexerLocksForToken.mockResolvedValue(null)
    mocks.getLockCountByToken.mockResolvedValue(7)
    expect(await queryLockCountByToken(VALID_CONTRACT_ADDRESS)).toBe(7)
  })
})

describe("queryMyLocks", () => {
  beforeEach(() => {
    resetAll()
    mocks.fetchPricesBatch.mockResolvedValue(new Map())
  })

  it("combines token and LP locks into created/received buckets", async () => {
    const created = { ...mockLock, id: "1" }
    const lpCreated = { ...mockLpLock, id: "2" }
    const received = { ...mockLock, id: "3", creator: OTHER_KEY }

    mocks.getLocksByCreator.mockResolvedValue([created])
    mocks.getLpLocksByCreator.mockResolvedValue([lpCreated])
    mocks.getLocksByBeneficiary.mockResolvedValue([received])
    mocks.getLpLocksByBeneficiary.mockResolvedValue([])
    mocks.getLockCountByCreator.mockResolvedValue(1)
    mocks.getLpLockCountByCreator.mockResolvedValue(1)
    mocks.getLockCountByBeneficiary.mockResolvedValue(1)
    mocks.getLpLockCountByBeneficiary.mockResolvedValue(0)

    const out = await queryMyLocks(VALID_PUBLIC_KEY)

    expect(out.created.map((l) => l.id).sort()).toEqual(["1", "2"])
    expect(out.received.map((l) => l.id)).toEqual(["3"])
    expect(out.totalCreated).toBe(2)
    expect(out.totalReceived).toBe(1)
  })

  it("filters received locks that the user themselves created", async () => {
    const selfLocker = { ...mockLock, id: "5", creator: VALID_PUBLIC_KEY }
    mocks.getLocksByBeneficiary.mockResolvedValue([selfLocker])
    mocks.getLpLocksByBeneficiary.mockResolvedValue([])
    mocks.getLocksByCreator.mockResolvedValue([])
    mocks.getLpLocksByCreator.mockResolvedValue([])
    mocks.getLockCountByCreator.mockResolvedValue(0)
    mocks.getLpLockCountByCreator.mockResolvedValue(0)
    mocks.getLockCountByBeneficiary.mockResolvedValue(1)
    mocks.getLpLockCountByBeneficiary.mockResolvedValue(0)

    const out = await queryMyLocks(VALID_PUBLIC_KEY)
    expect(out.received).toEqual([])
  })
})

describe("querySiteStats", () => {
  beforeEach(() => {
    resetAll()
    mocks.mapIndexerLocks.mockImplementation((raws: Lock[]) => Promise.resolve(raws))
    mocks.fetchPricesBatch.mockResolvedValue(new Map())
    mocks.getOnChainTokenMeta.mockResolvedValue({ symbol: "USDC", name: "USD Coin", decimals: 6 })
  })

  it("derives stats with source=indexer when the indexer responds", async () => {
    const dto: IndexerStatsDTO = {
      totalLocks: 10,
      totalValue: "1000",
      uniqueTokens: 2,
      recentLocks: [
        {
          id: "1",
          kind: "token",
          creator: VALID_PUBLIC_KEY,
          beneficiary: VALID_PUBLIC_KEY,
          token: VALID_CONTRACT_ADDRESS,
          amount: "10000000",
          unlockAt: Math.floor(Date.now() / 1000) + 3600,
          status: "locked",
          createdAt: Math.floor(Date.now() / 1000) - 3600,
        },
      ],
      upcomingUnlocks: [],
      topTokens: [
        {
          token: VALID_CONTRACT_ADDRESS,
          lockCount: 5,
          totalLocked: "1000000",
        },
      ],
    }
    mocks.fetchIndexerStats.mockResolvedValue(dto)

    const out = await querySiteStats()

    expect(out.source).toBe("indexer")
    expect(out.totalLocks).toBe(10)
    expect(out.uniqueTokens).toBe(2)
    expect(out.recentLocks).toHaveLength(1)
    expect(out.tokenGroups).toHaveLength(1)
    expect(out.tokenGroups[0].count).toBe(5)
  })

  it("returns a zeroed fallback with source=fallback when the indexer is unreachable", async () => {
    mocks.fetchIndexerStats.mockResolvedValue(null)

    const out = await querySiteStats()

    expect(out.source).toBe("fallback")
    expect(out.totalLocks).toBe(0)
    expect(out.uniqueTokens).toBe(0)
    expect(out.tokenGroups).toEqual([])
    expect(out.recentLocks).toEqual([])
    expect(out.upcomingUnlocks).toEqual([])
  })
})
