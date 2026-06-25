import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk"
import type { Lock, TokenLockSummary } from "@/types/lock"
import { CONTRACTS, simulateCall, submitCall, STELLAR_DECIMALS } from "@/lib/stellar"

export interface CreateTokenLockArgs {
  tokenAddress: string
  amount: number
  beneficiary: string
  unlockAt: number // unix seconds
  vesting?: { start: number; end: number }
}

// ── Converters ────────────────────────────────────────────────────────────────

/** Map a raw on-chain lock object (as returned by scValToNative) to our Lock type. */
function toLock(raw: Record<string, unknown>): Lock {
  const token = raw.token as string

  const vestingRaw = raw.vesting as { start: bigint; end: bigint; released: bigint } | null | undefined

  return {
    id: String(raw.id),
    kind: "token",
    status: raw.withdrawn ? "withdrawn" : Number(raw.unlock_at) * 1000 <= Date.now() ? "unlockable" : "locked",
    token: {
      address: token,
      symbol: token.slice(0, 6),
      name: token.slice(0, 6),
      decimals: 7,
    },
    creator: raw.creator as string,
    beneficiary: raw.beneficiary as string,
    amount: Number(raw.amount) / STELLAR_DECIMALS,
    usdValue: 0, // computed client-side if needed
    createdAt: Number(raw.created_at) * 1000,
    unlockAt: Number(raw.unlock_at) * 1000,
    extendedCount: Number(raw.extended_count),
    vesting: vestingRaw
      ? {
          start: Number(vestingRaw.start) * 1000,
          end: Number(vestingRaw.end) * 1000,
          released: Number(vestingRaw.released) / STELLAR_DECIMALS,
        }
      : undefined,
  }
}

function idArg(id: string): xdr.ScVal {
  return nativeToScVal(BigInt(id), { type: "u64" })
}

function addressArg(addr: string): xdr.ScVal {
  return new Address(addr).toScVal()
}

const DEFAULT_PAGE_SIZE = 50

function paginationArgs(offset: number, limit: number): xdr.ScVal[] {
  return [nativeToScVal(offset, { type: "u32" }), nativeToScVal(limit, { type: "u32" })]
}

// ── Read methods ──────────────────────────────────────────────────────────────

export async function getLock(id: string): Promise<Lock | null> {
  const raw = await simulateCall<Record<string, unknown> | null>(CONTRACTS.tokenLocker, "get_lock", [idArg(id)])
  return raw ? toLock(raw) : null
}

export async function getLocksByCreator(address: string, offset = 0, limit = DEFAULT_PAGE_SIZE): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(CONTRACTS.tokenLocker, "get_locks_by_creator", [
    addressArg(address),
    ...paginationArgs(offset, limit),
  ])
  return (raw ?? []).map(toLock)
}

export async function getLocksByBeneficiary(address: string, offset = 0, limit = DEFAULT_PAGE_SIZE): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(CONTRACTS.tokenLocker, "get_locks_by_beneficiary", [
    addressArg(address),
    ...paginationArgs(offset, limit),
  ])
  return (raw ?? []).map(toLock)
}

export async function getLockCountByCreator(address: string): Promise<number> {
  const raw = await simulateCall<number>(CONTRACTS.tokenLocker, "get_lock_count_by_creator", [addressArg(address)])
  return Number(raw ?? 0)
}

export async function getLockCountByBeneficiary(address: string): Promise<number> {
  const raw = await simulateCall<number>(CONTRACTS.tokenLocker, "get_lock_count_by_beneficiary", [addressArg(address)])
  return Number(raw ?? 0)
}

export async function getLockCountByToken(address: string): Promise<number> {
  const raw = await simulateCall<number>(CONTRACTS.tokenLocker, "get_lock_count_by_token", [addressArg(address)])
  return Number(raw ?? 0)
}

export async function getLocksByToken(
  tokenAddress: string,
  offset = 0,
  limit = DEFAULT_PAGE_SIZE,
): Promise<TokenLockSummary | null> {
  const raw = await simulateCall<Record<string, unknown>[]>(CONTRACTS.tokenLocker, "get_locks_by_token", [
    addressArg(tokenAddress),
    ...paginationArgs(offset, limit),
  ])
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
): Promise<{ id: string }> {
  const unlockAtSecs = Math.floor(args.unlockAt)
  const amountStroops = BigInt(Math.round(args.amount * STELLAR_DECIMALS))

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

  await submitCall(CONTRACTS.tokenLocker, "create_lock", scArgs, sourceAddress, signTransaction)

  // The contract returns a u64 id, but submitCall doesn't surface return values.
  // We return a temporary client-side id; the caller can re-fetch to get the real one.
  return { id: "pending" }
}

export async function withdrawLock(
  id: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<void> {
  await submitCall(CONTRACTS.tokenLocker, "withdraw", [idArg(id)], sourceAddress, signTransaction)
}

export async function transferBeneficiary(
  id: string,
  newBeneficiary: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<void> {
  await submitCall(
    CONTRACTS.tokenLocker,
    "transfer_beneficiary",
    [idArg(id), addressArg(newBeneficiary)],
    sourceAddress,
    signTransaction,
  )
}

export async function extendLock(
  id: string,
  newUnlockAt: number,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<void> {
  await submitCall(
    CONTRACTS.tokenLocker,
    "extend",
    [idArg(id), nativeToScVal(BigInt(Math.floor(newUnlockAt)), { type: "u64" })],
    sourceAddress,
    signTransaction,
  )
}
