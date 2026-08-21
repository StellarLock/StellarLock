import type { Lock } from "@/types/lock"

export interface TvlPoint {
  date: string
  tvl: number
}

export interface VolumePoint {
  date: string
  count: number
}

export interface DistributionSlice {
  symbol: string
  value: number
}

function dayKey(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10)
}

/** Cumulative USD value locked over time, one point per day a lock was created. */
export function getTvlOverTime(locks: Lock[]): TvlPoint[] {
  const sorted = [...locks].sort((a, b) => a.createdAt - b.createdAt)
  const byDay = new Map<string, number>()
  let running = 0
  for (const lock of sorted) {
    running += lock.usdValue ?? 0
    byDay.set(dayKey(lock.createdAt), running)
  }
  return Array.from(byDay, ([date, tvl]) => ({ date, tvl }))
}

/** Number of locks created per day. */
export function getLockVolumeByDay(locks: Lock[]): VolumePoint[] {
  const byDay = new Map<string, number>()
  for (const lock of locks) {
    const key = dayKey(lock.createdAt)
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
  }
  return Array.from(byDay, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date))
}

/** USD value locked per token symbol, sorted descending. */
export function getTokenDistribution(locks: Lock[]): DistributionSlice[] {
  const bySymbol = new Map<string, number>()
  for (const lock of locks) {
    bySymbol.set(lock.token.symbol, (bySymbol.get(lock.token.symbol) ?? 0) + (lock.usdValue ?? 0))
  }
  return Array.from(bySymbol, ([symbol, value]) => ({ symbol, value })).sort((a, b) => b.value - a.value)
}
