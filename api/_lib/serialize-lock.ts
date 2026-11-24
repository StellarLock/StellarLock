import type { IndexedLock } from "../../indexer/index"

/**
 * JSON-safe view of an indexed lock. `JSON.stringify` throws on bigints, so
 * every bigint field (`amount`, `released`) is emitted as a decimal string.
 */
export function serializeLock(lock: IndexedLock) {
  return { ...lock, amount: lock.amount.toString(), released: lock.released.toString() }
}
