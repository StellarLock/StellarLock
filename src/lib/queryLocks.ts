/**
 * queryLocks.ts — shared lock-querying layer
 *
 * Single entry-point for all lock read operations in the frontend.
 * Implements a two-tier strategy for every query:
 *
 *   1. Try the persistent lock indexer first (fast, DB-backed, paginated).
 *   2. Fall back to direct Soroban RPC simulation if the indexer is
 *      unreachable or returns no data for the requested key.
 *
 * All pages — Landing, Discover, Explorer, MyLocks — should consume this
 * module rather than calling token-locker.ts / lp-locker.ts / indexer-client.ts
 * directly for read operations.
 */

import type { Lock, TokenLockSummary, TokenMeta } from "@/types/lock"
import {
  getLock,
  getLocksByToken,
  getLocksByCreator,
  getLocksByBeneficiary,
  getLockCountByCreator,
  getLockCountByBeneficiary,
  getLockCountByToken,
} from "@/lib/token-locker"
import {
  getLpLock,
  getLpLocksByCreator,
  getLpLocksByBeneficiary,
  getLpLockCountByCreator,
  getLpLockCountByBeneficiary,
} from "@/lib/lp-locker"
import {
  fetchIndexerStats,
  fetchIndexerLocksForToken,
  mapIndexerLocks,
  mapIndexerLocksPageToSummary,
  type IndexerStatsDTO,
} from "@/lib/indexer-client"
import { fetchPricesBatch } from "@/lib/prices"
import { getOnChainTokenMeta } from "@/lib/token-metadata"

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Enrich a set of locks with approximate USD values via the price oracle. */
async function withUsdValues(locks: Lock[]): Promise<Lock[]> {
  if (locks.length === 0) return locks
  const addresses = [...new Set(locks.map((l) => l.token.address))]
  const prices = await fetchPricesBatch(addresses)
  return locks.map((l) => ({ ...l, usdValue: (prices.get(l.token.address) ?? 0) * l.amount }))
}

// ── Single-lock queries ────────────────────────────────────────────────────────

/**
 * Fetch a single token lock by id, enriched with USD value.
 * Returns null if the lock does not exist on-chain.
 */
export async function queryTokenLock(id: string): Promise<Lock | null> {
  const raw = await getLock(id)
  if (!raw) return null
  const [enriched] = await withUsdValues([raw])
  return enriched
}

/**
 * Fetch a single LP lock by id, enriched with USD value.
 * Returns null if the lock does not exist on-chain.
 */
export async function queryLpLock(id: string): Promise<Lock | null> {
  const raw = await getLpLock(id)
  if (!raw) return null
  const [enriched] = await withUsdValues([raw])
  return enriched
}

// ── Per-token queries (Explorer) ───────────────────────────────────────────────

/**
 * Fetch aggregate stats + a page of locks for a given token address.
 * Prefers the indexer for speed; falls back to direct RPC if unavailable.
 */
export async function queryLocksByToken(
  tokenAddress: string,
  offset = 0,
  limit = 50,
): Promise<TokenLockSummary | null> {
  // Prefer indexer path
  const indexerPage = await fetchIndexerLocksForToken(tokenAddress, offset, limit)
  const summary = indexerPage
    ? ((await mapIndexerLocksPageToSummary(indexerPage)) ?? (await getLocksByToken(tokenAddress, offset, limit)))
    : await getLocksByToken(tokenAddress, offset, limit)

  if (!summary) return null
  const enriched = await withUsdValues(summary.locks)
  const totalUsdValue = enriched.reduce((s, l) => s + l.usdValue, 0)
  return { ...summary, locks: enriched, totalUsdValue }
}

/**
 * Return the total number of locks for a token (for pagination controls).
 * Prefers the indexer's DB-level count to avoid a full RPC scan.
 */
export async function queryLockCountByToken(tokenAddress: string): Promise<number> {
  const indexerPage = await fetchIndexerLocksForToken(tokenAddress, 0, 1)
  if (indexerPage) return indexerPage.total
  return getLockCountByToken(tokenAddress)
}

// ── Per-user queries (MyLocks) ─────────────────────────────────────────────────

export interface UserLocks {
  created: Lock[]
  received: Lock[]
  totalCreated: number
  totalReceived: number
}

/**
 * Return all locks created and received by a given address, combined from
 * token-locker and lp-locker, enriched with USD values.
 */
export async function queryMyLocks(address: string, offset = 0, limit = 50): Promise<UserLocks> {
  const [tCreated, lpCreated, tReceived, lpReceived, tCreatedCount, lpCreatedCount, tReceivedCount, lpReceivedCount] =
    await Promise.all([
      getLocksByCreator(address, offset, limit),
      getLpLocksByCreator(address, offset, limit),
      getLocksByBeneficiary(address, offset, limit),
      getLpLocksByBeneficiary(address, offset, limit),
      getLockCountByCreator(address),
      getLpLockCountByCreator(address),
      getLockCountByBeneficiary(address),
      getLpLockCountByBeneficiary(address),
    ])

  const allLocks = [...tCreated, ...lpCreated, ...tReceived, ...lpReceived]
  const enriched = await withUsdValues(allLocks)
  const enrichedMap = new Map(enriched.map((l) => [l.id, l]))

  const created = [...tCreated, ...lpCreated].map((l) => enrichedMap.get(l.id) ?? l)
  const received = [...tReceived, ...lpReceived]
    .filter((l) => l.creator !== address)
    .map((l) => enrichedMap.get(l.id) ?? l)

  return {
    created,
    received,
    totalCreated: tCreatedCount + lpCreatedCount,
    totalReceived: tReceivedCount + lpReceivedCount,
  }
}

// ── Site-wide stats (Landing + Discover) ──────────────────────────────────────

export interface TokenGroup {
  token: TokenMeta
  count: number
  totalValue: number
}

export interface SiteStats {
  /** Which data source served these stats — useful for debugging. */
  source: "indexer" | "fallback"
  totalLocks: number
  totalValueLocked: number
  uniqueTokens: number
  recentLocks: Lock[]
  upcomingUnlocks: Lock[]
  tokenGroups: TokenGroup[]
}

const FEATURED_TOKEN_COUNT = 6

/** Derive a `SiteStats` shape from a live indexer response. */
async function statsFromIndexer(dto: IndexerStatsDTO): Promise<SiteStats> {
  const [recentLocks, upcomingUnlocks] = await Promise.all([
    mapIndexerLocks(dto.recentLocks).then(withUsdValues),
    mapIndexerLocks(dto.upcomingUnlocks).then(withUsdValues),
  ])

  const topTokenAddrs = dto.topTokens.map((t) => t.token)
  const [metaEntries, prices] = await Promise.all([
    Promise.all(topTokenAddrs.map(async (addr) => [addr, await getOnChainTokenMeta(addr)] as const)),
    fetchPricesBatch(topTokenAddrs),
  ])
  const metaMap = new Map(metaEntries)

  const tokenValue = (agg: (typeof dto.topTokens)[number]) => {
    const meta = metaMap.get(agg.token)
    const decimals = meta?.decimals ?? 7
    const amount = Number(BigInt(agg.totalLocked)) / 10 ** decimals
    return amount * (prices.get(agg.token) ?? 0)
  }

  const tokenGroups: TokenGroup[] = dto.topTokens.slice(0, FEATURED_TOKEN_COUNT).map((agg) => {
    const meta = metaMap.get(agg.token)
    return {
      token: {
        address: agg.token,
        symbol: meta?.symbol ?? agg.token.slice(0, 6),
        name: meta?.name ?? agg.token.slice(0, 6),
        decimals: meta?.decimals ?? 7,
      },
      count: agg.lockCount,
      totalValue: tokenValue(agg),
    }
  })

  return {
    source: "indexer",
    totalLocks: dto.totalLocks,
    totalValueLocked: dto.topTokens.reduce((sum, agg) => sum + tokenValue(agg), 0),
    uniqueTokens: dto.uniqueTokens,
    recentLocks,
    upcomingUnlocks,
    tokenGroups,
  }
}

/**
 * Fetch site-wide aggregate stats used by the Landing hero strip and
 * Discover page. Prefers the indexer; falls back to an empty/zeroed state
 * when the indexer is unavailable (the frontend used to fall back to
 * MOCK_LOCKS here, but that displayed fabricated on-chain data to users).
 *
 * Callers that want a mock-data fallback for local development can check
 * `stats.source === "fallback"` and overlay demo data themselves.
 */
export async function querySiteStats(): Promise<SiteStats> {
  const dto = await fetchIndexerStats()

  if (dto) {
    return statsFromIndexer(dto)
  }

  // Indexer unavailable — return an empty but correctly-shaped result so the
  // UI degrades gracefully (shows zeros + empty lists) rather than fabricated
  // mock numbers. Discover.tsx also returns an empty fallback (see useDiscoverStats,
  // #211) so no page displays fake locks to users.
  return {
    source: "fallback",
    totalLocks: 0,
    totalValueLocked: 0,
    uniqueTokens: 0,
    recentLocks: [],
    upcomingUnlocks: [],
    tokenGroups: [],
  }
}
