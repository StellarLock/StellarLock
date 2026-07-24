import { useAsync } from "@/hooks/useAsync"
import { getTokenBalance, getTokenAllowance } from "@/lib/stellar"
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
  getLpLocksByBeneficiary,
  getLpLocksByCreator,
  getLpLockCountByCreator,
  getLpLockCountByBeneficiary,
} from "@/lib/lp-locker"
import { fetchPricesBatch } from "@/lib/prices"
import {
  fetchIndexerLocksForToken,
  fetchIndexerStats,
  mapIndexerLocks,
  mapIndexerLocksPageToSummary,
} from "@/lib/indexer-client"
import { getOnChainTokenMeta } from "@/lib/token-metadata"
import { MOCK_LOCKS } from "@/lib/mock-data"
import type { Lock, TokenMeta } from "@/types/lock"

async function withUsdValues(locks: Lock[]): Promise<Lock[]> {
  if (locks.length === 0) return locks
  const addresses = locks.map((l) => l.token.address)
  const prices = await fetchPricesBatch(addresses)
  return locks.map((l) => ({ ...l, usdValue: (prices.get(l.token.address) ?? 0) * l.amount }))
}

/**
 * Single lock by id and type. Tries token-locker for "token" type,
 * lp-locker for "lp" type.
 */
export function useLock(id: string | undefined, type: "token" | "lp" = "token") {
  return useAsync(async () => {
    if (!id) return null
    const raw = type === "lp" ? await getLpLock(id) : await getLock(id)
    if (!raw) return null
    const [enriched] = await withUsdValues([raw])
    return enriched
  }, [id, type])
}

/** Public explorer: all locks for a token address. Prefers the lock indexer (faster, paginated at the DB level); falls back to direct RPC if the indexer is unreachable or has no data for this token. */
export function useLocksByToken(tokenAddress: string | undefined, offset = 0, limit = 50) {
  return useAsync(async () => {
    if (!tokenAddress) return null
    const indexerPage = await fetchIndexerLocksForToken(tokenAddress, offset, limit)
    const summary = indexerPage
      ? (await mapIndexerLocksPageToSummary(indexerPage)) ?? (await getLocksByToken(tokenAddress, offset, limit))
      : await getLocksByToken(tokenAddress, offset, limit)
    if (!summary) return null
    const enriched = await withUsdValues(summary.locks)
    const totalUsdValue = enriched.reduce((s, l) => s + l.usdValue, 0)
    return { ...summary, locks: enriched, totalUsdValue }
  }, [tokenAddress, offset, limit])
}

/** Lock count for a token (for pagination controls). Prefers the indexer's DB-level count. */
export function useLockCountByToken(tokenAddress: string | undefined) {
  return useAsync(async () => {
    if (!tokenAddress) return 0
    const indexerPage = await fetchIndexerLocksForToken(tokenAddress, 0, 1)
    if (indexerPage) return indexerPage.total
    return getLockCountByToken(tokenAddress)
  }, [tokenAddress])
}

/** Connected user's locks, split into created vs received (token + LP combined). */
export function useMyLocks(address: string | null, offset = 0, limit = 50) {
  return useAsync(async () => {
    if (!address) return { created: [] as Lock[], received: [] as Lock[], totalCreated: 0, totalReceived: 0 }
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
  }, [address, offset, limit])
}

/** Fetch a user's balance for a specific SEP-41 token contract. */
export function useTokenBalance(tokenAddress: string | undefined, owner: string | null) {
  return useAsync(
    () => (tokenAddress && owner ? getTokenBalance(tokenAddress, owner) : Promise.resolve(null)),
    [tokenAddress, owner],
  )
}

/** Fetch a user's allowance for a specific token contract and spender. */
export function useTokenAllowance(
  tokenAddress: string | undefined,
  owner: string | null,
  spender: string | undefined,
) {
  return useAsync(
    () =>
      tokenAddress && owner && spender
        ? getTokenAllowance(tokenAddress, owner, spender)
        : Promise.resolve(null),
    [tokenAddress, owner, spender],
  )
}

export interface DiscoverTokenGroup {
  token: TokenMeta
  count: number
  totalValue: number
}

export interface DiscoverStats {
  /** Which backend actually served this data — surfaced for debugging/telemetry, not shown to users. */
  source: "indexer" | "mock"
  totalLocks: number
  totalValueLocked: number
  uniqueTokens: number
  recentLocks: Lock[]
  upcomingUnlocks: Lock[]
  tokenGroups: DiscoverTokenGroup[]
}

const FEATURED_TOKEN_COUNT = 6

/**
 * Site-wide discover stats (total locks, TVL, per-token breakdown, recent
 * activity). The indexer is what makes the cross-token aggregates
 * (uniqueTokens, per-token TVL ranking) possible without iterating every
 * token contract over RPC; falls back to the bundled demo dataset if the
 * indexer API is unreachable.
 */
export function useDiscoverStats() {
  return useAsync<DiscoverStats>(async () => {
    const stats = await fetchIndexerStats()

    if (stats) {
      const [recentLocks, upcomingUnlocks] = await Promise.all([
        mapIndexerLocks(stats.recentLocks).then(withUsdValues),
        mapIndexerLocks(stats.upcomingUnlocks).then(withUsdValues),
      ])

      const topTokenAddrs = stats.topTokens.map((t) => t.token)
      const [metaEntries, prices] = await Promise.all([
        Promise.all(topTokenAddrs.map(async (addr) => [addr, await getOnChainTokenMeta(addr)] as const)),
        fetchPricesBatch(topTokenAddrs),
      ])
      const metaMap = new Map(metaEntries)

      const tokenValue = (agg: (typeof stats.topTokens)[number]) => {
        const meta = metaMap.get(agg.token)
        const decimals = meta?.decimals ?? 7
        const amount = Number(BigInt(agg.totalLocked)) / 10 ** decimals
        return amount * (prices.get(agg.token) ?? 0)
      }

      const tokenGroups: DiscoverTokenGroup[] = stats.topTokens.slice(0, FEATURED_TOKEN_COUNT).map((agg) => {
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
        totalLocks: stats.totalLocks,
        totalValueLocked: stats.topTokens.reduce((sum, agg) => sum + tokenValue(agg), 0),
        uniqueTokens: stats.uniqueTokens,
        recentLocks,
        upcomingUnlocks,
        tokenGroups,
      }
    }

    // Fallback: derive the same shape from the bundled demo dataset.
    const activeLocks = MOCK_LOCKS.filter((l) => l.status !== "withdrawn")
    const totalValueLocked = activeLocks.reduce((s, l) => s + l.usdValue, 0)
    const uniqueTokens = new Set(activeLocks.map((l) => l.token.address)).size
    const recentLocks = [...MOCK_LOCKS].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)
    const upcomingUnlocks = activeLocks
      .filter((l) => l.status === "locked")
      .sort((a, b) => a.unlockAt - b.unlockAt)
      .slice(0, 5)

    const tokenGroups = Object.values(
      activeLocks.reduce<Record<string, DiscoverTokenGroup>>((acc, lock) => {
        const key = lock.token.address
        acc[key] ??= { token: lock.token, count: 0, totalValue: 0 }
        acc[key].count++
        acc[key].totalValue += lock.usdValue
        return acc
      }, {}),
    ).sort((a, b) => b.totalValue - a.totalValue)

    return {
      source: "mock",
      totalLocks: activeLocks.length,
      totalValueLocked,
      uniqueTokens,
      recentLocks,
      upcomingUnlocks,
      tokenGroups,
    }
  }, [])
}
