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
  getLpLocksByBeneficiary,
  getLpLocksByCreator,
  getLpLockCountByCreator,
  getLpLockCountByBeneficiary,
} from "@/lib/lp-locker"
import type { Lock } from "@/types/lock"

/** Single lock by id (used by the detail page). */
export function useLock(id: string | undefined) {
  return useAsync(() => (id ? getLock(id) : Promise.resolve(null)), [id])
}

/** Public explorer: all locks for a token address. */
export function useLocksByToken(tokenAddress: string | undefined, offset = 0, limit = 50) {
  return useAsync(
    () => (tokenAddress ? getLocksByToken(tokenAddress, offset, limit) : Promise.resolve(null)),
    [tokenAddress, offset, limit],
  )
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
    const created = [...tCreated, ...lpCreated]
    const received = [...tReceived, ...lpReceived].filter((l) => l.creator !== address)
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
