import { getLockById } from "../indexer/index"
import { serializeLock } from "./_lib/serialize-lock"

type JsonRes = { status: (code: number) => { json: (payload: unknown) => void } }
type QueryReq = { query?: Record<string, string | string[] | undefined> }

function queryParam(query: QueryReq["query"], key: string): string | undefined {
  const value = query?.[key]
  return Array.isArray(value) ? value[0] : value
}

/**
 * Single-lock lookup by the indexer's internal id (`${contractId}:${numericId}`),
 * backed by the lock indexer's SQLite database.
 *
 * Used by the frontend (#1084) as an archival fallback for LockDetail: once a
 * withdrawn lock's on-chain TTL (`WITHDRAWN_BUMP`, 30 days) lapses, the
 * contract's `get_lock` starts returning `None`, but this indexer row is
 * never deleted — so a previously-shared verification link can still resolve
 * to the lock's final (withdrawn) state instead of "not found".
 *
 * Same fallback contract as the other indexer-backed endpoints: 404 (lock
 * genuinely unknown to the indexer) or 503 (indexer unavailable) both mean
 * the caller has exhausted every data source.
 */
export default function handler(req: QueryReq, res: JsonRes) {
  const id = queryParam(req.query, "id")
  if (!id) {
    res.status(400).json({ error: "missing_id" })
    return
  }

  try {
    const lock = getLockById(id)
    if (!lock) {
      res.status(404).json({ error: "lock_not_found" })
      return
    }
    res.status(200).json(serializeLock(lock))
  } catch (err) {
    res.status(503).json({
      error: "indexer_unavailable",
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
