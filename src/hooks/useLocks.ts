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
import type { Lock } from "@/types/lock"

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

/** Public explorer: all locks for a token address. */
export function useLocksByToken(tokenAddress: string | undefined, offset = 0, limit = 50) {
  return useAsync(async () => {
    if (!tokenAddress) return null
    const summary = await getLocksByToken(tokenAddress, offset, limit)
    if (!summary) return null
    const enriched = await withUsdValues(summary.locks)
    const totalUsdValue = enriched.reduce((s, l) => s + l.usdValue, 0)
    return { ...summary, locks: enriched, totalUsdValue }
  }, [tokenAddress, offset, limit])
}

/** Lock count for a token (for pagination controls). */
export function useLockCountByToken(tokenAddress: string | undefined) {
  return useAsync(() => (tokenAddress ? getLockCountByToken(tokenAddress) : Promise.resolve(0)), [tokenAddress])
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
