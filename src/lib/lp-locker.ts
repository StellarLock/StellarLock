import {
  Address,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk"
import type { Dex, Lock, LockMetadata } from "@/types/lock"
import { CONTRACTS, simulateCall, submitCall } from "@/lib/stellar"

export interface CreateLpLockArgs {
  poolShareAddress: string
  dex: Dex
  tokenA: string
  tokenB: string
  amount: number
  beneficiary: string
  unlockAt: number // unix seconds
  metadata?: { description?: string; projectUrl?: string; logoUrl?: string }
}

// ── Converters ────────────────────────────────────────────────────────────────

function toLpLock(raw: Record<string, unknown>): Lock {
  const poolShare = raw.pool_share as string
  const dex = (raw.dex as string).toLowerCase() as Dex
  const tokenA = raw.token_a as string
  const tokenB = raw.token_b as string
  const metadata = parseMetadata(raw.metadata)

  return {
    id: String(raw.id),
    kind: "lp",
    status: raw.withdrawn
      ? "withdrawn"
      : Number(raw.unlock_at) * 1000 <= Date.now()
      ? "unlockable"
      : "locked",
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
    amount: Number(raw.amount) / 1e7,
    usdValue: 0,
    createdAt: Number(raw.created_at) * 1000,
    unlockAt: Number(raw.unlock_at) * 1000,
    extendedCount: Number(raw.extended_count),
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
function metadataArg(metadata: CreateLpLockArgs["metadata"]): xdr.ScVal {
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

export async function getLpLocksByCreator(address: string): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(
    CONTRACTS.lpLocker,
    "get_locks_by_creator",
    [addressArg(address)],
  )
  return (raw ?? []).map(toLpLock)
}

export async function getLpLocksByBeneficiary(address: string): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(
    CONTRACTS.lpLocker,
    "get_locks_by_beneficiary",
    [addressArg(address)],
  )
  return (raw ?? []).map(toLpLock)
}

// ── Write methods ─────────────────────────────────────────────────────────────

export async function createLpLock(
  args: CreateLpLockArgs,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<{ id: string; hash: string }> {
  const scArgs: xdr.ScVal[] = [
    addressArg(sourceAddress),
    addressArg(args.poolShareAddress),
    nativeToScVal(args.dex),
    addressArg(args.tokenA),
    addressArg(args.tokenB),
    nativeToScVal(BigInt(Math.round(args.amount * 1e7)), { type: "i128" }),
    addressArg(args.beneficiary),
    nativeToScVal(BigInt(Math.floor(args.unlockAt)), { type: "u64" }),
    metadataArg(args.metadata),
  ]

  const { hash } = await submitCall(CONTRACTS.lpLocker, "create_lock", scArgs, sourceAddress, signTransaction)
  return { id: "pending", hash }
}

export async function withdrawLpLock(
  id: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<{ hash: string }> {
  return submitCall(CONTRACTS.lpLocker, "withdraw", [idArg(id)], sourceAddress, signTransaction)
}

export async function extendLpLock(
  id: string,
  newUnlockAt: number,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<{ hash: string }> {
  return submitCall(
    CONTRACTS.lpLocker,
    "extend",
    [idArg(id), nativeToScVal(BigInt(Math.floor(newUnlockAt)), { type: "u64" })],
    sourceAddress,
    signTransaction,
  )
}
