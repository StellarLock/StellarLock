import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk"
import type { Dex, Lock } from "@/types/lock"
import { CONTRACTS, simulateCall, submitCall, type TxPhase } from "@/lib/stellar"
import { getOnChainTokenMeta } from "@/lib/token-metadata"

export interface CreateLpLockArgs {
  poolShareAddress: string
  dex: Dex
  tokenA: string
  tokenB: string
  amount: number
  beneficiary: string
  unlockAt: number
}

export async function submitTokenApproval(
  tokenAddress: string,
  owner: string,
  spender: string,
  amount: number,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<void> {
  const amountStroops = BigInt(Math.round(amount * 1e7))
  const expirationLedger = 0

  const scArgs: xdr.ScVal[] = [
    new Address(owner).toScVal(),
    new Address(spender).toScVal(),
    nativeToScVal(amountStroops, { type: "i128" }),
    nativeToScVal(expirationLedger, { type: "u32" }),
  ]

  await submitCall(tokenAddress, "approve", scArgs, sourceAddress, signTransaction)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function idArg(id: string): xdr.ScVal {
  return nativeToScVal(BigInt(id), { type: "u64" })
}

function addressArg(addr: string): xdr.ScVal {
  return new Address(addr).toScVal()
}

/**
 * Encode the Dex enum as a Soroban contracttype enum ScVal.
 * On-chain: enum Dex { Aquarius = 0, Soroswap = 1 }
 * Soroban encodes enum variants as a single-element vec: [Symbol("VariantName")]
 */
function dexArg(dex: Dex): xdr.ScVal {
  const variant = dex === "aquarius" ? "Aquarius" : "Soroswap"
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant)])
}

// ── Converters ────────────────────────────────────────────────────────────────

interface LpMeta {
  tokenASymbol: string
  tokenBSymbol: string
  poolDecimals: number
}

function toLpLock(raw: Record<string, unknown>, meta?: LpMeta): Lock {
  const poolShare = raw.pool_share as string
  const dexRaw = raw.dex as { tag?: string } | string
  const dex: Dex = (
    typeof dexRaw === "object" && dexRaw?.tag ? dexRaw.tag.toLowerCase() : String(dexRaw).toLowerCase()
  ) as Dex
  const tokenA = raw.token_a as string
  const tokenB = raw.token_b as string

  const tokenASymbol = meta?.tokenASymbol ?? tokenA.slice(0, 4)
  const tokenBSymbol = meta?.tokenBSymbol ?? tokenB.slice(0, 4)
  const poolDecimals = meta?.poolDecimals ?? 7
  const multiplier = 10 ** poolDecimals

  return {
    id: String(raw.id),
    kind: "lp",
    status: raw.withdrawn ? "withdrawn" : Number(raw.unlock_at) * 1000 <= Date.now() ? "unlockable" : "locked",
    token: {
      address: poolShare,
      symbol: `${tokenASymbol}-${tokenBSymbol} LP`,
      name: `${tokenASymbol}/${tokenBSymbol} Pool Share`,
      decimals: poolDecimals,
    },
    dex,
    poolPair: [tokenA, tokenB],
    creator: raw.creator as string,
    beneficiary: raw.beneficiary as string,
    amount: Number(raw.amount) / multiplier,
    usdValue: 0,
    createdAt: Number(raw.created_at) * 1000,
    unlockAt: Number(raw.unlock_at) * 1000,
    extendedCount: Number(raw.extended_count),
  }
}

/** Fetch on-chain metadata for LP locks: tokenA/tokenB symbols + pool share decimals. */
async function enrichLpLocks(raws: Record<string, unknown>[]): Promise<Lock[]> {
  const tokenAAddrs = [...new Set(raws.map((r) => r.token_a as string))]
  const tokenBAddrs = [...new Set(raws.map((r) => r.token_b as string))]
  const poolAddrs = [...new Set(raws.map((r) => r.pool_share as string))]

  const allAddrs = [...new Set([...tokenAAddrs, ...tokenBAddrs, ...poolAddrs])]
  const entries = await Promise.all(allAddrs.map(async (addr) => [addr, await getOnChainTokenMeta(addr)] as const))
  const metaMap = new Map(entries)

  return raws.map((r) => {
    const tokenAMeta = metaMap.get(r.token_a as string)
    const tokenBMeta = metaMap.get(r.token_b as string)
    const poolMeta = metaMap.get(r.pool_share as string)
    return toLpLock(r, {
      tokenASymbol: tokenAMeta?.symbol ?? (r.token_a as string).slice(0, 4),
      tokenBSymbol: tokenBMeta?.symbol ?? (r.token_b as string).slice(0, 4),
      poolDecimals: poolMeta?.decimals ?? 7,
    })
  })
}

// ── Read methods ──────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 50

function paginationArgs(offset: number, limit: number): xdr.ScVal[] {
  return [nativeToScVal(offset, { type: "u32" }), nativeToScVal(limit, { type: "u32" })]
}

export async function getLpLocksByCreator(address: string, offset = 0, limit = DEFAULT_PAGE_SIZE): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(CONTRACTS.lpLocker, "get_locks_by_creator", [
    addressArg(address),
    ...paginationArgs(offset, limit),
  ])
  return enrichLpLocks(raw ?? [])
}

export async function getLpLocksByBeneficiary(address: string, offset = 0, limit = DEFAULT_PAGE_SIZE): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(CONTRACTS.lpLocker, "get_locks_by_beneficiary", [
    addressArg(address),
    ...paginationArgs(offset, limit),
  ])
  return enrichLpLocks(raw ?? [])
}

export async function getLpLockCountByCreator(address: string): Promise<number> {
  const raw = await simulateCall<number>(CONTRACTS.lpLocker, "get_lock_count_by_creator", [addressArg(address)])
  return Number(raw ?? 0)
}

export async function getLpLockCountByBeneficiary(address: string): Promise<number> {
  const raw = await simulateCall<number>(CONTRACTS.lpLocker, "get_lock_count_by_beneficiary", [addressArg(address)])
  return Number(raw ?? 0)
}

// ── Write methods ─────────────────────────────────────────────────────────────

export async function createLpLock(
  args: CreateLpLockArgs,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<{ id: string }> {
  const scArgs: xdr.ScVal[] = [
    addressArg(sourceAddress),
    addressArg(args.poolShareAddress),
    dexArg(args.dex),
    addressArg(args.tokenA),
    addressArg(args.tokenB),
    nativeToScVal(BigInt(Math.round(args.amount * 1e7)), { type: "i128" }),
    addressArg(args.beneficiary),
    nativeToScVal(BigInt(Math.floor(args.unlockAt)), { type: "u64" }),
  ]

  await submitCall(CONTRACTS.lpLocker, "create_lock", scArgs, sourceAddress, signTransaction, onProgress)
  return { id: "pending" }
}

export async function withdrawLpLock(
  id: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<void> {
  await submitCall(CONTRACTS.lpLocker, "withdraw", [idArg(id)], sourceAddress, signTransaction, onProgress)
}

export async function extendLpLock(
  id: string,
  newUnlockAt: number,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<void> {
  await submitCall(
    CONTRACTS.lpLocker,
    "extend",
    [idArg(id), nativeToScVal(BigInt(Math.floor(newUnlockAt)), { type: "u64" })],
    sourceAddress,
    signTransaction,
    onProgress,
  )
}

export async function transferLpBeneficiary(
  id: string,
  newBeneficiary: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<void> {
  await submitCall(
    CONTRACTS.lpLocker,
    "transfer_beneficiary",
    [idArg(id), addressArg(newBeneficiary)],
    sourceAddress,
    signTransaction,
    onProgress,
  )
}
