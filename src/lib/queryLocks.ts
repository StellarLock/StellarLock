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

import { lockKey, type Lock, type TokenLockSummary, type TokenMeta } from "@/types/lock"
import {
  getLock,
  getLocksByToken,
  getLocksByCreator,
  getLocksByBeneficiary,
  getLockCountByCreator,
  getLockCountByToken,
} from "@/lib/token-locker"
import {
  getLpLock,
  getLpLocksByCreator,
  getLpLocksByBeneficiary,
  getLpLockCountByCreator,
} from "@/lib/lp-locker"
import { isArchivedError } from "@/lib/stellar"
import {
  fetchIndexerStats,
  fetchIndexerLocksForToken,
  fetchIndexerLockById,
  mapIndexerLocks,
  mapIndexerLock,
  mapIndexerLocksPageToSummary,
  type IndexerStatsDTO,
} from "@/lib/indexer-client"
import { fetchPricesBatch } from "@/lib/prices"
import { getOnChainTokenMeta } from "@/lib/token-metadata"
import { CONTRACTS } from "@/lib/stellar"

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Enrich a set of locks with approximate USD values via the price oracle. */
async function withUsdValues(locks: Lock[]): Promise<Lock[]> {
  if (locks.length === 0) return locks
  const addresses = [...new Set(locks.map((l) => l.token.address))]
  const prices = await fetchPricesBatch(addresses)
  return locks.map((l) => ({ ...l, usdValue: (prices.get(l.token.address) ?? 0) * l.amount }))
}

/**
 * Build a minimal Lock stub for an archived on-chain entry.
 * Most fields are unknown until the entry is restored, so they carry safe
 * zero/empty defaults. The important fields are `id`, `kind`, and
 * `status: "archived"` — enough for the UI to show the restore action.
 */
function buildArchivedStub(id: string, kind: "token" | "lp"): Lock {
  return {
    id,
    kind,
    status: "archived",
    token: { address: "", symbol: "—", name: "Archived lock", decimals: 7 },
    creator: "",
    beneficiary: "",
    amount: 0,
    usdValue: 0,
    createdAt: 0,
    unlockAt: 0,
    extendedCount: 0,
  }
}

// ── Single-lock queries ────────────────────────────────────────────────────────

/**
 * Fall back to the lock indexer's archival record when a direct RPC lookup
 * comes back empty (#1084). Withdrawn locks get bumped to a 30-day TTL on
 * the contract (`WITHDRAWN_BUMP`); once that lapses `get_lock` returns `None`
 * forever even though the lock's final state is still meaningful history.
 * Returns null if the indexer has no record either — genuinely not found.
 */
async function queryArchivedLock(contractId: string, id: string): Promise<Lock | null> {
  const dto = await fetchIndexerLockById(`${contractId}:${id}`)
  if (!dto) return null
  const lock = await mapIndexerLock(dto)
  const [enriched] = await withUsdValues([lock])
  return { ...enriched, archived: true }
}

/**
 * Fetch a single token lock by id, enriched with USD value.
 * Returns null if the lock does not exist on-chain or in the indexer archive.
 */
export async function queryTokenLock(id: string): Promise<Lock | null> {
  const raw = await getLock(id)
  if (!raw) return queryArchivedLock(CONTRACTS.tokenLocker, id)
 * Returns null if the lock does not exist on-chain.
 * Returns a stub with status "archived" when the on-chain entry has expired
 * from active ledger storage and needs a RestoreFootprint before it is usable.
 */
export async function queryTokenLock(id: string): Promise<Lock | null> {
  let raw: Lock | null
  try {
    raw = await getLock(id)
  } catch (err) {
    if (isArchivedError(err)) {
      return buildArchivedStub(id, "token")
    }
    throw err
  }
  if (!raw) return null
  const [enriched] = await withUsdValues([raw])
  return enriched
}

/**
 * Fetch a single LP lock by id, enriched with USD value.
 * Returns null if the lock does not exist on-chain or in the indexer archive.
 */
export async function queryLpLock(id: string): Promise<Lock | null> {
  const raw = await getLpLock(id)
  if (!raw) return queryArchivedLock(CONTRACTS.lpLocker, id)
 * Returns null if the lock does not exist on-chain.
 * Returns a stub with status "archived" when the on-chain entry has expired.
 */
export async function queryLpLock(id: string): Promise<Lock | null> {
  let raw: Lock | null
  try {
    raw = await getLpLock(id)
  } catch (err) {
    if (isArchivedError(err)) {
      return buildArchivedStub(id, "lp")
    }
    throw err
  }
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

interface UserLocks {
  created: Lock[]
  received: Lock[]
  totalCreated: number
  totalReceived: number
}

/**
 * Return all locks created and received by a given address, combined from
 * token-locker and lp-locker, enriched with USD values.
 * Individual list fetches that fail with an archived-entry error are silently
 * swallowed (the entry will appear in the detail page stub instead).
 */
export async function queryMyLocks(address: string, offset = 0, limit = 50): Promise<UserLocks> {
  // Note: there's no on-chain count for "beneficiary locks excluding
  // self-created ones", so totalReceived below is derived from the filtered
  // `received` list instead of a separate ByBeneficiary count call.
  const [tCreated, lpCreated, tReceived, lpReceived, tCreatedCount, lpCreatedCount] = await Promise.all([
    getLocksByCreator(address, offset, limit),
    getLpLocksByCreator(address, offset, limit),
    getLocksByBeneficiary(address, offset, limit),
    getLpLocksByBeneficiary(address, offset, limit),
  async function safeList<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn()
    } catch (err) {
      if (isArchivedError(err)) return []
      throw err
    }
  }

  const [
    tCreated,
    lpCreated,
    tReceived,
    lpReceived,
    tCreatedCount,
    lpCreatedCount,
    tReceivedCount,
    lpReceivedCount,
  ] = await Promise.all([
    safeList(() => getLocksByCreator(address, offset, limit)),
    safeList(() => getLpLocksByCreator(address, offset, limit)),
    safeList(() => getLocksByBeneficiary(address, offset, limit)),
    safeList(() => getLpLocksByBeneficiary(address, offset, limit)),
    getLockCountByCreator(address),
    getLpLockCountByCreator(address),
  ])

  const allLocks = [...tCreated, ...lpCreated, ...tReceived, ...lpReceived]
  const enriched = await withUsdValues(allLocks)
  // Keyed by `${kind}:${id}`, not bare id — token-locker and LP-locker ids
  // are independent counters and can collide once token ids pass 5000 (#1081).
  const enrichedMap = new Map(enriched.map((l) => [lockKey(l), l]))

  const created = [...tCreated, ...lpCreated].map((l) => enrichedMap.get(lockKey(l)) ?? l)
  const received = [...tReceived, ...lpReceived]
    .filter((l) => l.creator !== address)
    .map((l) => enrichedMap.get(lockKey(l)) ?? l)

  return {
    created,
    received,
    totalCreated: tCreatedCount + lpCreatedCount,
    // `received` above excludes locks the address created itself (the
    // "Received" tab never shows those rows), so the count must come from
    // the same filtered list — otherwise the tab badge/pagination total
    // disagrees with what's actually rendered. The raw on-chain
    // `ByBeneficiary` index length (tReceivedCount + lpReceivedCount) still
    // includes self-locks and must not be used here.
    totalReceived: received.length,
  }
}

// ── Site-wide stats (Landing + Discover) ──────────────────────────────────────

interface TokenGroup {
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
  // mock numbers. Discover.tsx falls back to MOCK_LOCKS for the demo case via
  // useDiscoverStats, which is preserved for that page.
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
