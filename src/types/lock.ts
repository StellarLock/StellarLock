export type LockKind = "token" | "lp"

export type Dex = "aquarius" | "soroswap"

export type LockStatus = "locked" | "unlockable" | "withdrawn"

export interface TokenMeta {
  /** Contract address of the token (C...) */
  address: string
  symbol: string
  name: string
  decimals: number
  /** Optional logo url; falls back to a generated monogram. */
  logo?: string
}

export interface LockMetadata {
  description: string
  projectUrl: string
  logoUrl: string
}

export interface VestingSchedule {
  /** Unix ms when linear vesting begins. */
  start: number
  /** Unix ms when fully vested. */
  end: number
  /** Amount already released to the beneficiary. */
  released: number
}

export interface Lock {
  /** On-chain lock id (u64). */
  id: string
  kind: LockKind
  status: LockStatus

  /** Token being locked. For LP locks this is the pool share token. */
  token: TokenMeta

  /** LP-specific metadata, present when kind === "lp". */
  dex?: Dex
  poolPair?: [string, string]

  /** Address that created + funded the lock. */
  creator: string
  /** Address that can withdraw once unlocked. */
  beneficiary: string

  /** Total locked amount (token units, not stroops). */
  amount: number
  /** Approx USD value at lock time, for display. */
  usdValue: number

  /** Unix ms timestamps. */
  createdAt: number
  unlockAt: number

  /** Number of times the unlock date was extended (can only increase). */
  extendedCount: number

  /** Optional linear vesting schedule. */
  vesting?: VestingSchedule

  /** Optional public-facing project info, set at lock creation. */
  metadata?: LockMetadata
}

/** Aggregate stats for a single token's explorer page. */
export interface TokenLockSummary {
  token: TokenMeta
  totalLocked: number
  totalUsdValue: number
  activeLocks: number
  /** Earliest upcoming unlock across all active locks. */
  nextUnlockAt: number | null
  /** Percentage of circulating supply locked, if known. */
  percentOfSupply?: number
  locks: Lock[]
}
