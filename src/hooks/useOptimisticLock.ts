import { useCallback, useMemo, useRef, useState } from "react"

import type { Lock } from "@/types/lock"

/**
 * Fields a caller is allowed to update optimistically. Identity and provenance
 * (`id`, `creator`, `token`, `createdAt`) are never predicted locally.
 */
export type OptimisticLockPatch = Partial<
  Pick<Lock, "status" | "unlockAt" | "beneficiary" | "amount" | "extendedCount">
>

export interface UseOptimisticLock {
  /** The lock with any in-flight optimistic patch applied. */
  lock: Lock | null
  /** True while an optimistic patch is applied and unconfirmed. */
  isPending: boolean
  /**
   * Apply `patch` immediately so the UI reflects the intended outcome before
   * the transaction confirms. Snapshots the current values for rollback.
   */
  applyOptimistic: (patch: OptimisticLockPatch) => void
  /**
   * Transaction confirmed — drop the patch so the next authoritative read
   * from the chain is what renders.
   */
  confirmOptimistic: () => void
  /** Transaction failed — discard the patch and restore what was on screen. */
  revertOptimistic: () => void
}

/**
 * Optimistic overlay for a single lock.
 *
 * Withdrawing or extending a lock takes a signature plus a round trip to the
 * network, during which the UI would otherwise keep showing the pre-transaction
 * state. This applies the intended result straight away and rolls it back if
 * the transaction fails.
 *
 * The patch is held separately from the source lock rather than copied into it,
 * so a refetch landing mid-flight is not clobbered by stale local state, and
 * `Lock`'s own types stay honest — there is no synthetic "pending" status.
 */
export function useOptimisticLock(source: Lock | null): UseOptimisticLock {
  const [patch, setPatch] = useState<OptimisticLockPatch | null>(null)
  // Kept in a ref because rollback must not itself trigger a render pass.
  const snapshotRef = useRef<OptimisticLockPatch | null>(null)

  const applyOptimistic = useCallback(
    (next: OptimisticLockPatch) => {
      if (source) {
        const keys = Object.keys(next) as (keyof OptimisticLockPatch)[]
        const snapshot: OptimisticLockPatch = {}
        for (const key of keys) {
          // Narrowing per-key keeps the snapshot typed without a cast.
          Object.assign(snapshot, { [key]: source[key] })
        }
        snapshotRef.current = snapshot
      }
      setPatch(next)
    },
    [source],
  )

  const confirmOptimistic = useCallback(() => {
    snapshotRef.current = null
    setPatch(null)
  }, [])

  const revertOptimistic = useCallback(() => {
    snapshotRef.current = null
    setPatch(null)
  }, [])

  const lock = useMemo(() => {
    if (!source) return null
    if (!patch) return source
    return { ...source, ...patch }
  }, [source, patch])

  return {
    lock,
    isPending: patch !== null,
    applyOptimistic,
    confirmOptimistic,
    revertOptimistic,
  }
}
