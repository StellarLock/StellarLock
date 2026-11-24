import { getStats, getTopTokens, type IndexedLock, type TokenAggregate } from "../indexer/index"

type JsonRes = { status: (code: number) => { json: (payload: unknown) => void } }

function serializeLock(lock: IndexedLock) {
  return { ...lock, amount: lock.amount.toString() }
}

function serializeTokenAggregate(agg: TokenAggregate) {
  return { ...agg, totalLocked: agg.totalLocked.toString() }
}

/**
 * Read-only view over the lock indexer's SQLite database. Requires a
 * separately-running `indexer/index.ts` poller writing to the same
 * LOCK_INDEX_DB_PATH — if that file doesn't exist or is stale, callers should
 * fall back to direct RPC queries (see src/lib/indexer-client.ts).
 */
export default function handler(_req: unknown, res: JsonRes) {
  try {
    const stats = getStats()
    const topTokens = getTopTokens()

    res.status(200).json({
      totalLocks: stats.totalLocks,
      totalValue: stats.totalValue.toString(),
      uniqueTokens: stats.uniqueTokens,
      recentLocks: stats.recentLocks.map(serializeLock),
      upcomingUnlocks: stats.upcomingUnlocks.map(serializeLock),
      topTokens: topTokens.map(serializeTokenAggregate),
    })
  } catch (err) {
    res.status(503).json({
      error: "indexer_unavailable",
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
