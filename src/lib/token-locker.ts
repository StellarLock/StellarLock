import {
  Address,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk"
import type { Lock, LockMetadata, TokenLockSummary } from "@/types/lock"
import { CONTRACTS, simulateCall, submitCall } from "@/lib/stellar"

export interface CreateTokenLockArgs {
  tokenAddress: string
  amount: number
  beneficiary: string
  unlockAt: number // unix seconds
  vesting?: { start: number; end: number }
  metadata?: { description?: string; projectUrl?: string; logoUrl?: string }
}

// ── Converters ────────────────────────────────────────────────────────────────

/** Map a raw on-chain lock object (as returned by scValToNative) to our Lock type. */
function toLock(raw: Record<string, unknown>): Lock {
  const token = raw.token as string

  const vestingRaw = raw.vesting as { start: bigint; end: bigint; released: bigint } | null | undefined
  const metadata = parseMetadata(raw.metadata)

  return {
    id: String(raw.id),
    kind: "token",
    status: raw.withdrawn
      ? "withdrawn"
      : Number(raw.unlock_at) * 1000 <= Date.now()
      ? "unlockable"
      : "locked",
    token: {
      address: token,
      symbol: token.slice(0, 6),
      name: token.slice(0, 6),
      decimals: 7,
    },
    creator: raw.creator as string,
    beneficiary: raw.beneficiary as string,
    amount: Number(raw.amount) / 1e7,
    usdValue: 0, // computed client-side if needed
    createdAt: Number(raw.created_at) * 1000,
    unlockAt: Number(raw.unlock_at) * 1000,
    extendedCount: Number(raw.extended_count),
    vesting: vestingRaw
      ? {
          start: Number(vestingRaw.start) * 1000,
          end: Number(vestingRaw.end) * 1000,
          released: Number(vestingRaw.released) / 1e7,
        }
      : undefined,
    metadata,
  }
}

/** LockMetadata is stored non-optionally on-chain; empty strings mean "not set". */
function parseMetadata(raw: unknown): LockMetadata | undefined {
  const m = raw as { description: string; project_url: string; logo_url: string } | null | undefined
  if (!m || (!m.description && !m.project_url && !m.logo_url)) return undefined
  return { description: m.description, projectUrl: m.project_url, logoUrl: m.logo_url }
}

function idArg(id: string): xdr.ScVal {
  return nativeToScVal(BigInt(id), { type: "u64" })
}

function addressArg(addr: string): xdr.ScVal {
  return new Address(addr).toScVal()
}

/** LockMetadata is a plain (non-Option) struct on-chain — always send a full map. */
function metadataArg(metadata: CreateTokenLockArgs["metadata"]): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("description"),
      val: nativeToScVal(metadata?.description ?? "", { type: "string" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("logo_url"),
      val: nativeToScVal(metadata?.logoUrl ?? "", { type: "string" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("project_url"),
      val: nativeToScVal(metadata?.projectUrl ?? "", { type: "string" }),
    }),
  ])
}

// ── Read methods ──────────────────────────────────────────────────────────────

export async function getLock(id: string): Promise<Lock | null> {
  const raw = await simulateCall<Record<string, unknown> | null>(
    CONTRACTS.tokenLocker,
    "get_lock",
    [idArg(id)],
  )
  return raw ? toLock(raw) : null
}

export async function getLocksByCreator(address: string): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(
    CONTRACTS.tokenLocker,
    "get_locks_by_creator",
    [addressArg(address)],
  )
  return (raw ?? []).map(toLock)
}

export async function getLocksByBeneficiary(address: string): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(
    CONTRACTS.tokenLocker,
    "get_locks_by_beneficiary",
    [addressArg(address)],
  )
  return (raw ?? []).map(toLock)
}

export async function getLocksByToken(tokenAddress: string): Promise<TokenLockSummary | null> {
  const raw = await simulateCall<Record<string, unknown>[]>(
    CONTRACTS.tokenLocker,
    "get_locks_by_token",
    [addressArg(tokenAddress)],
  )
  if (!raw || raw.length === 0) return null

  const locks = raw.map(toLock)
  const active = locks.filter((l) => l.status !== "withdrawn")
  const totalLocked = active.reduce((s, l) => s + l.amount, 0)
  const upcoming = active
    .filter((l) => l.status === "locked")
    .map((l) => l.unlockAt)
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

// ── Write methods ─────────────────────────────────────────────────────────────

export async function createTokenLock(
  args: CreateTokenLockArgs,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<{ id: string; hash: string }> {
  const unlockAtSecs = Math.floor(args.unlockAt)
  const amountStroops = BigInt(Math.round(args.amount * 1e7))

  const scArgs: xdr.ScVal[] = [
    addressArg(sourceAddress),
    addressArg(args.tokenAddress),
    nativeToScVal(amountStroops, { type: "i128" }),
    addressArg(args.beneficiary),
    nativeToScVal(BigInt(unlockAtSecs), { type: "u64" }),
  ]

  // Vesting is Option<Vesting> on-chain.
  // Soroban Option::Some(v) = ScvMap with the struct fields sorted by key.
  // Soroban Option::None    = ScvVoid
  if (args.vesting) {
    const vestingMap = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("end"),
        val: nativeToScVal(BigInt(Math.floor(args.vesting.end)), { type: "u64" }),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("released"),
        val: nativeToScVal(BigInt(0), { type: "i128" }),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("start"),
        val: nativeToScVal(BigInt(Math.floor(args.vesting.start)), { type: "u64" }),
      }),
    ])
    scArgs.push(vestingMap)
  } else {
    scArgs.push(xdr.ScVal.scvVoid())
  }

  scArgs.push(metadataArg(args.metadata))

  const { hash } = await submitCall(CONTRACTS.tokenLocker, "create_lock", scArgs, sourceAddress, signTransaction)

  // The contract returns a u64 id, but submitCall doesn't surface return values.
  // We return a temporary client-side id; the caller can re-fetch to get the real one.
  return { id: "pending", hash }
}

export async function withdrawLock(
  id: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<{ hash: string }> {
  return submitCall(
    CONTRACTS.tokenLocker,
    "withdraw",
    [idArg(id)],
    sourceAddress,
    signTransaction,
  )
}

export async function extendLock(
  id: string,
  newUnlockAt: number,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<{ hash: string }> {
  return submitCall(
    CONTRACTS.tokenLocker,
    "extend",
    [idArg(id), nativeToScVal(BigInt(Math.floor(newUnlockAt)), { type: "u64" })],
    sourceAddress,
    signTransaction,
  )
}
