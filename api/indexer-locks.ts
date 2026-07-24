import { getLocksForTokenPage } from "../indexer/index"

type JsonRes = { status: (code: number) => { json: (payload: unknown) => void } }
type QueryReq = { query?: Record<string, string | string[] | undefined> }

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

function queryParam(query: QueryReq["query"], key: string): string | undefined {
  const value = query?.[key]
  return Array.isArray(value) ? value[0] : value
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/**
 * Paginated lock lookup by token (or LP pool-share) address, backed by the
 * lock indexer's SQLite database. Same fallback contract as
 * api/indexer-stats.ts: 503 (or unreachable) means the caller should fall
 * back to a direct contract query.
 */
export default function handler(req: QueryReq, res: JsonRes) {
  const token = queryParam(req.query, "token")
  if (!token) {
    res.status(400).json({ error: "missing_token" })
    return
  }

  const offset = clampInt(queryParam(req.query, "offset"), 0, 0, Number.MAX_SAFE_INTEGER)
  const limit = clampInt(queryParam(req.query, "limit"), DEFAULT_LIMIT, 1, MAX_LIMIT)

  try {
    const { locks, total } = getLocksForTokenPage(token, offset, limit)
    res.status(200).json({
      total,
      locks: locks.map((lock) => ({ ...lock, amount: lock.amount.toString() })),
    })
  } catch (err) {
    res.status(503).json({
      error: "indexer_unavailable",
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
