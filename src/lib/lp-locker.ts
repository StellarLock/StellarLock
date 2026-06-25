import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk"
import type { Dex, Lock } from "@/types/lock"
import { CONTRACTS, simulateCall, submitCall, STELLAR_DECIMALS } from "@/lib/stellar"

export interface CreateLpLockArgs {
  poolShareAddress: string
  dex: Dex
  tokenA: string
  tokenB: string
  amount: number
  beneficiary: string
  unlockAt: number // unix seconds
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

function toLpLock(raw: Record<string, unknown>): Lock {
  const poolShare = raw.pool_share as string
  const dexRaw = raw.dex as { tag?: string } | string
  const dex: Dex = (
    typeof dexRaw === "object" && dexRaw?.tag ? dexRaw.tag.toLowerCase() : String(dexRaw).toLowerCase()
  ) as Dex
  const tokenA = raw.token_a as string
  const tokenB = raw.token_b as string

  return {
    id: String(raw.id),
    kind: "lp",
    status: raw.withdrawn ? "withdrawn" : Number(raw.unlock_at) * 1000 <= Date.now() ? "unlockable" : "locked",
    token: {
      address: poolShare,
      symbol: `${tokenA.slice(0, 4)}-${tokenB.slice(0, 4)} LP`,
      name: `${tokenA.slice(0, 6)}/${tokenB.slice(0, 6)} Pool Share`,
      decimals: 7,
    },
    dex,
    poolPair: [tokenA, tokenB],
    creator: raw.creator as string,
    beneficiary: raw.beneficiary as string,
    amount: Number(raw.amount) / STELLAR_DECIMALS,
    usdValue: 0,
    createdAt: Number(raw.created_at) * 1000,
    unlockAt: Number(raw.unlock_at) * 1000,
    extendedCount: Number(raw.extended_count),
  }
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
  return (raw ?? []).map(toLpLock)
}

export async function getLpLocksByBeneficiary(address: string, offset = 0, limit = DEFAULT_PAGE_SIZE): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(CONTRACTS.lpLocker, "get_locks_by_beneficiary", [
    addressArg(address),
    ...paginationArgs(offset, limit),
  ])
  return (raw ?? []).map(toLpLock)
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
): Promise<{ id: string }> {
  const scArgs: xdr.ScVal[] = [
    addressArg(sourceAddress),
    addressArg(args.poolShareAddress),
    dexArg(args.dex),
    addressArg(args.tokenA),
    addressArg(args.tokenB),
    nativeToScVal(BigInt(Math.round(args.amount * STELLAR_DECIMALS)), { type: "i128" }),
    addressArg(args.beneficiary),
    nativeToScVal(BigInt(Math.floor(args.unlockAt)), { type: "u64" }),
  ]

  await submitCall(CONTRACTS.lpLocker, "create_lock", scArgs, sourceAddress, signTransaction)
  return { id: "pending" }
}

export async function withdrawLpLock(
  id: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<void> {
  await submitCall(CONTRACTS.lpLocker, "withdraw", [idArg(id)], sourceAddress, signTransaction)
}

export async function extendLpLock(
  id: string,
  newUnlockAt: number,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<void> {
  await submitCall(
    CONTRACTS.lpLocker,
    "extend",
    [idArg(id), nativeToScVal(BigInt(Math.floor(newUnlockAt)), { type: "u64" })],
    sourceAddress,
    signTransaction,
  )
}

export async function transferLpBeneficiary(
  id: string,
  newBeneficiary: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<void> {
  await submitCall(
    CONTRACTS.lpLocker,
    "transfer_beneficiary",
    [idArg(id), addressArg(newBeneficiary)],
    sourceAddress,
    signTransaction,
  )
}
