import { getLockEvents } from "../indexer/index"

type JsonRes = { status: (code: number) => { json: (payload: unknown) => void } }
type QueryReq = { query?: Record<string, string | string[] | undefined> }

function queryParam(query: QueryReq["query"], key: string): string | undefined {
  const value = query?.[key]
  return Array.isArray(value) ? value[0] : value
}

/**
 * Per-lock event history endpoint.
 *
 * GET /api/indexer-lock-events?lockId=CXXX…:42
 *
 * Returns all indexed events for the given lock, ordered oldest-first (by
 * ledger sequence). Each event includes the tx hash, ledger close time, and
 * the full decoded payload (topics + data as JSON).
 *
 * Query params:
 *   lockId  – required; canonical lock id, e.g. `"CXXX…:42"`.
 *             The contract address prefix ensures uniqueness across
 *             multiple contract deployments (Issue #1127).
 *
 * Responses:
 *   200  { events: IndexedLockEvent[] }
 *   400  { error: "missing_lock_id" }
 *   503  { error: "indexer_unavailable", message: string }
 */
export default function handler(req: QueryReq, res: JsonRes) {
  let lockId = queryParam(req.query, "lockId")
  if (!lockId) {
    res.status(400).json({ error: "missing_lock_id" })
    return
  }

  try {
    const events = getLockEvents(lockId)
    res.status(200).json({ events })
  } catch (err) {
    res.status(503).json({
      error: "indexer_unavailable",
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
