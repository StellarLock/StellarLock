import type { Lock, TokenLockSummary } from "@/types/lock"
import { getOnChainTokenMeta } from "@/lib/token-metadata"
import { createLogger } from "@/lib/logger"

const log = createLogger("indexer-client")

// Same shapes as indexer/index.ts's IndexedLock / AggregateStats / TokenAggregate,
// but with bigint fields serialized to strings over the wire.
export interface IndexerLockDTO {
  id: string
  kind: "token" | "lp"
  /** Contract address that created this lock (token-locker or lp-locker). */
  contractId: string
  creator: string
  beneficiary: string
  token: string
  token_a?: string | null
  token_b?: string | null
  dex?: string | null
  pool_share?: string | null
  amount: string
  released: string
  unlockAt: number
  status: "locked" | "withdrawn"
  createdAt: number
  extendedCount?: number
  withdrawn?: boolean
}

export interface IndexerTokenAggregateDTO {
  token: string
  lockCount: number
  totalLocked: string
}

export interface IndexerStatsDTO {
  totalLocks: number
  uniqueTokens: number
  recentLocks: IndexerLockDTO[]
  upcomingUnlocks: IndexerLockDTO[]
  topTokens: IndexerTokenAggregateDTO[]
  lastIndexedLedger?: number
  latestLedger?: number
  lagLedgers?: number
  contractStatus?: Array<{
    contractId: string
    paused: boolean
    pendingUpgradeHash: string | null
    pendingUpgradeExecuteAfter: number | null
  }>
}

export interface IndexerLocksPageDTO {
  total: number
  locks: IndexerLockDTO[]
  lastIndexedLedger?: number
  latestLedger?: number
  lagLedgers?: number
}

const FETCH_TIMEOUT_MS = 3000
const CACHE_TTL_MS = 10_000
// Maximum number of entries kept in the cache at any time. When the cap is
// reached the oldest-inserted entry is evicted (insertion-order LRU) before
// adding the new one. This prevents unbounded growth when a user browses many
// token/page combinations in a long-lived session (fixes #755).
const CACHE_MAX_SIZE = 100
const MAX_ACCEPTABLE_LAG = Number(import.meta.env.VITE_INDEXER_MAX_LAG_LEDGERS ?? 20)

interface CacheEntry<T> {
  data: T
  expiry: number
}

/**
 * Indexer-backed lock ids are namespaced by kind (e.g. `token:1000`,
 * `lp:5000`) to stay unique in the indexer's own storage. The frontend's
 * on-chain `Lock.id` is just the bare numeric id (as returned by RPC), and
 * Discover/Explorer build detail links as `/app/lock/${kind}/${id}` — so an
 * un-stripped namespaced id produces a broken `/app/lock/token/token:1000`
 * link (#1079).
 */
function stripKindPrefix(id: string, kind: IndexerLockDTO["kind"]): string {
  const prefix = `${kind}:`
  return id.startsWith(prefix) ? id.slice(prefix.length) : id
}

/**
 * Remaining (unclaimed) amount for an indexer lock row, in token units:
 * cumulative on-chain `amount` minus cumulative `released`, clamped to zero.
 * `released` is dropped by the public `Lock` type (whose optional `vesting`
 * needs a start/end the indexer doesn't currently serve), so aggregates that
 * need the vested-aware remaining total must read it straight off the DTO
 * instead of off the mapped `Lock.amount` (which stays the full original
 * amount, matching the RPC-sourced `Lock` shape) — see #1080.
 */
function remainingAmount(raw: IndexerLockDTO, decimals: number): number {
  const amount = BigInt(raw.amount)
  const released = BigInt(raw.released || "0")
  const remaining = amount > released ? amount - released : 0n
  return Number(remaining) / 10 ** decimals
}

const statsCache = new Map<string, CacheEntry<unknown>>()

/** Remove all entries whose TTL has already elapsed. */
function pruneExpiredEntries(): void {
  const now = Date.now()
  for (const [key, entry] of statsCache) {
    if (entry.expiry <= now) {
      statsCache.delete(key)
    }
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const cached = statsCache.get(url)
  if (cached && cached.expiry > Date.now()) return cached.data as T

  // Sweep expired entries on every fetch so the Map does not grow unbounded
  // across pagination (each unique offset/limit combination is a new key).
  pruneExpiredEntries()

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) {
      log.debug("[indexer] non-OK response, falling back to direct RPC", { url, status: res.status })
      return null
    }
    const data = (await res.json()) as T

    const lagLedgers = (data as { lagLedgers?: unknown }).lagLedgers
    if (typeof lagLedgers === "number" && lagLedgers > MAX_ACCEPTABLE_LAG) {
      log.warn("indexer lag exceeds fallback threshold", {
        lagLedgers,
        maxAcceptableLag: MAX_ACCEPTABLE_LAG,
        url,
      })
      return null
    }

    // Enforce hard size cap: evict the oldest entry (Maps preserve insertion
    // order) before inserting a new one so memory stays bounded even when
    // every unexpired entry happens to share the same TTL window.
    if (statsCache.size >= CACHE_MAX_SIZE) {
      const oldestKey = statsCache.keys().next().value
      if (oldestKey !== undefined) {
        statsCache.delete(oldestKey)
      }
    }

    statsCache.set(url, { data, expiry: Date.now() + CACHE_TTL_MS })
    return data
  } catch (err) {
    log.debug("[indexer] unreachable, falling back to direct RPC", { url, err })
    return null
  }
}

/** Fetch aggregate stats from the lock indexer. Returns null if unavailable — callers should fall back. */
export function fetchIndexerStats(): Promise<IndexerStatsDTO | null> {
  return fetchJson<IndexerStatsDTO>("/api/indexer-stats")
}

/** Fetch a page of locks for a token/pool-share address from the lock indexer. Returns null if unavailable. */
export function fetchIndexerLocksForToken(
  token: string,
  offset: number,
  limit: number,
): Promise<IndexerLocksPageDTO | null> {
  const params = new URLSearchParams({ token, offset: String(offset), limit: String(limit) })
  return fetchJson<IndexerLocksPageDTO>(`/api/indexer-locks?${params}`)
}

// ── DTO → frontend Lock mapping ────────────────────────────────────────────────

/** Map indexer lock rows to the frontend Lock type, resolving token metadata on-chain. */
export async function mapIndexerLocks(dtoLocks: IndexerLockDTO[]): Promise<Lock[]> {
  const uniqueTokens = [...new Set(dtoLocks.map((l) => l.token))]
  const metaEntries = await Promise.all(
    uniqueTokens.map(async (addr) => [addr, await getOnChainTokenMeta(addr)] as const),
  )
  const metaMap = new Map(metaEntries)

  const now = Date.now()
  return dtoLocks.map((raw): Lock => {
    const meta = metaMap.get(raw.token)
    const decimals = meta?.decimals ?? 7
    const multiplier = 10 ** decimals
    const unlockAtMs = raw.unlockAt * 1000

    return {
      id: stripKindPrefix(raw.id, raw.kind),
      kind: raw.kind,
      status: raw.withdrawn || raw.status === "withdrawn" ? "withdrawn" : unlockAtMs <= now ? "unlockable" : "locked",
      token: {
        address: raw.token,
        symbol: meta?.symbol ?? raw.token.slice(0, 6),
        name: meta?.name ?? raw.token.slice(0, 6),
        decimals,
      },
      creator: raw.creator,
      beneficiary: raw.beneficiary,
      amount: Number(BigInt(raw.amount)) / multiplier,
      usdValue: 0,
      createdAt: raw.createdAt * 1000,
      unlockAt: unlockAtMs,
      extendedCount: raw.extendedCount ?? 0,
    }
  })
}

/** Build a TokenLockSummary (same shape token-locker.ts's getLocksByToken returns) from an indexer page. */
export async function mapIndexerLocksPageToSummary(page: IndexerLocksPageDTO): Promise<TokenLockSummary | null> {
  // Indexer rows are keyed by address, which is shared by a token contract and
  // (in principle) an LP pool-share contract; a per-token Explorer page only
  // expects the token-kind locks for that address.
  const tokenLocks = page.locks.filter((l) => l.kind === "token")
  if (tokenLocks.length === 0) return null

  const locks = await mapIndexerLocks(tokenLocks)
  // locks[] is produced 1:1, in the same order, from tokenLocks[] by
  // mapIndexerLocks — zip them back together so the aggregate below can use
  // each row's cumulative `released` (#1080), which the mapped Lock itself
  // doesn't carry.
  const pairs = locks.map((lock, i) => ({ lock, raw: tokenLocks[i] }))
  const active = pairs.filter(({ lock }) => lock.status !== "withdrawn")
  const totalLocked = active.reduce((s, { lock, raw }) => s + remainingAmount(raw, lock.token.decimals), 0)
  const upcoming = active
    .filter(({ lock }) => lock.status === "locked")
    .map(({ lock }) => lock.unlockAt)
    .sort((a, b) => a - b)

  return {
    token: locks[0].token,
    totalLocked,
    totalUsdValue: 0,
    activeLocks: active.length,
    nextUnlockAt: upcoming[0] ?? null,
    locks,
  }
}
