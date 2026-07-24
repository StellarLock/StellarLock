import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk"
import type { Lock, LockMetadata, TokenLockSummary } from "@/types/lock"
import { CONTRACTS, simulateCall, submitCall, submitCallWithHash, type TxPhase } from "@/lib/stellar"
import { getOnChainTokenMeta, type OnChainTokenMeta } from "@/lib/token-metadata"

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
function toLock(raw: Record<string, unknown>, meta?: OnChainTokenMeta): Lock {
  const token = raw.token as string
  const decimals = meta?.decimals ?? 7
  const multiplier = 10 ** decimals

  const vestingRaw = raw.vesting as { start: bigint; end: bigint; released: bigint } | null | undefined
  const metadata = parseMetadata(raw.metadata)

  return {
    id: String(raw.id),
    kind: "token",
    status: raw.withdrawn ? "withdrawn" : Number(raw.unlock_at) * 1000 <= Date.now() ? "unlockable" : "locked",
    token: {
      address: token,
      symbol: meta?.symbol ?? token.slice(0, 6),
      name: meta?.name ?? token.slice(0, 6),
      decimals,
    },
    creator: raw.creator as string,
    beneficiary: raw.beneficiary as string,
    amount: Number(raw.amount) / multiplier,
    usdValue: 0, // computed client-side if needed
    createdAt: Number(raw.created_at) * 1000,
    unlockAt: Number(raw.unlock_at) * 1000,
    extendedCount: Number(raw.extended_count),
    vesting: vestingRaw
      ? {
          start: Number(vestingRaw.start) * 1000,
          end: Number(vestingRaw.end) * 1000,
          released: Number(vestingRaw.released) / multiplier,
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

/** Fetch on-chain metadata for all unique token addresses in a batch, then map raw locks. */
async function enrichLocks(raws: Record<string, unknown>[]): Promise<Lock[]> {
  const unique = [...new Set(raws.map((r) => r.token as string))]
  const entries = await Promise.all(unique.map(async (addr) => [addr, await getOnChainTokenMeta(addr)] as const))
  const metaMap = new Map(entries)
  return raws.map((r) => toLock(r, metaMap.get(r.token as string)))
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

const DEFAULT_PAGE_SIZE = 50

function paginationArgs(offset: number, limit: number): xdr.ScVal[] {
  return [nativeToScVal(offset, { type: "u32" }), nativeToScVal(limit, { type: "u32" })]
}

// ── Read methods ──────────────────────────────────────────────────────────────

/**
 * Fetch a single token lock by id via a read-only contract simulation
 * (`get_lock`), enriched with on-chain token metadata (symbol/name/decimals).
 *
 * @param id - Numeric lock id (as a decimal string), assigned by the contract at creation time.
 * @returns The parsed {@link Lock}, or `null` if no lock with that id exists on-chain.
 * @throws {Error} `Simulation error: ...` if the RPC simulation itself fails (network issue,
 *   malformed contract id, etc). Does not throw a {@link ContractError} — a missing lock
 *   simply resolves to `null` since `get_lock` returns `Option<Lock>` on-chain.
 */
export async function getLock(id: string): Promise<Lock | null> {
  const raw = await simulateCall<Record<string, unknown> | null>(CONTRACTS.tokenLocker, "get_lock", [idArg(id)])
  if (!raw) return null
  const meta = await getOnChainTokenMeta(raw.token as string)
  return toLock(raw, meta)
}

/**
 * List locks created by a given address, newest index first, paginated
 * server-side by the contract's `ByCreator` index.
 *
 * @param address - Stellar `G...`/`C...` address of the lock creator.
 * @param offset - Zero-based index into the creator's lock list to start from (default `0`).
 * @param limit - Maximum number of locks to return in this page (default {@link DEFAULT_PAGE_SIZE}).
 * @returns Enriched {@link Lock} objects (empty array if the creator has no locks).
 * @throws {Error} `Simulation error: ...` if the read-only simulation fails.
 */
export async function getLocksByCreator(address: string, offset = 0, limit = DEFAULT_PAGE_SIZE): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(CONTRACTS.tokenLocker, "get_locks_by_creator", [
    addressArg(address),
    ...paginationArgs(offset, limit),
  ])
  return enrichLocks(raw ?? [])
}

/**
 * List locks where a given address is the beneficiary, paginated server-side
 * by the contract's `ByBeneficiary` index.
 *
 * @param address - Stellar `G...`/`C...` address of the beneficiary.
 * @param offset - Zero-based index into the beneficiary's lock list to start from (default `0`).
 * @param limit - Maximum number of locks to return in this page (default {@link DEFAULT_PAGE_SIZE}).
 * @returns Enriched {@link Lock} objects (empty array if the address is not a beneficiary of any lock).
 * @throws {Error} `Simulation error: ...` if the read-only simulation fails.
 */
export async function getLocksByBeneficiary(address: string, offset = 0, limit = DEFAULT_PAGE_SIZE): Promise<Lock[]> {
  const raw = await simulateCall<Record<string, unknown>[]>(CONTRACTS.tokenLocker, "get_locks_by_beneficiary", [
    addressArg(address),
    ...paginationArgs(offset, limit),
  ])
  return enrichLocks(raw ?? [])
}

/**
 * Count how many locks a given address has created (length of the on-chain
 * `ByCreator` index), useful for pagination without fetching a full page.
 *
 * @param address - Stellar `G...`/`C...` address of the lock creator.
 * @returns Total number of locks created by `address` (`0` if none).
 * @throws {Error} `Simulation error: ...` if the read-only simulation fails.
 */
export async function getLockCountByCreator(address: string): Promise<number> {
  const raw = await simulateCall<number>(CONTRACTS.tokenLocker, "get_lock_count_by_creator", [addressArg(address)])
  return Number(raw ?? 0)
}

/**
 * Count how many locks a given address is the beneficiary of (length of the
 * on-chain `ByBeneficiary` index).
 *
 * @param address - Stellar `G...`/`C...` address of the beneficiary.
 * @returns Total number of locks where `address` is the beneficiary (`0` if none).
 * @throws {Error} `Simulation error: ...` if the read-only simulation fails.
 */
export async function getLockCountByBeneficiary(address: string): Promise<number> {
  const raw = await simulateCall<number>(CONTRACTS.tokenLocker, "get_lock_count_by_beneficiary", [addressArg(address)])
  return Number(raw ?? 0)
}

/**
 * Count how many locks exist for a given token (length of the on-chain
 * `ByToken` index), regardless of creator/beneficiary.
 *
 * @param address - Contract address of the locked token (SEP-41 asset contract).
 * @returns Total number of locks for `address` (`0` if the token has never been locked).
 * @throws {Error} `Simulation error: ...` if the read-only simulation fails.
 */
export async function getLockCountByToken(address: string): Promise<number> {
  const raw = await simulateCall<number>(CONTRACTS.tokenLocker, "get_lock_count_by_token", [addressArg(address)])
  return Number(raw ?? 0)
}

/**
 * Fetch aggregate lock stats plus a page of locks for a given token —
 * total locked amount, active lock count, and the soonest upcoming unlock
 * date across still-locked positions.
 *
 * @param tokenAddress - Contract address of the locked token (SEP-41 asset contract).
 * @param offset - Zero-based index into the token's lock list to start from (default `0`).
 * @param limit - Maximum number of locks to include in this page (default {@link DEFAULT_PAGE_SIZE}).
 * @returns A {@link TokenLockSummary} with the requested page of locks, or `null` if the
 *   token has no locks at all (note: with pagination, a non-first page can also come back
 *   empty even though earlier pages have locks — check `offset` against the token's total count).
 * @throws {Error} `Simulation error: ...` if the read-only simulation fails.
 */
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

  const locks = await enrichLocks(raw)
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

/**
 * Create a new token lock on-chain: transfers `args.amount` of `args.tokenAddress`
 * from `sourceAddress` into the contract, escrowed until `args.unlockAt`, optionally
 * released gradually per `args.vesting`. Requires `sourceAddress`'s signature
 * (`creator.require_auth()` on-chain) and prior token allowance/balance sufficient
 * to cover the transfer.
 *
 * @param args - Lock parameters:
 *   - `tokenAddress` — contract address of the SEP-41 token to lock.
 *   - `amount` — human-readable amount (converted to stroops using 7 decimals).
 *   - `beneficiary` — address allowed to withdraw once unlocked.
 *   - `unlockAt` — unix seconds after which withdrawal becomes possible; must be in the future.
 *   - `vesting` — optional `{ start, end }` unix-second window for linear vesting; if provided,
 *     `withdraw` releases tokens proportionally to elapsed time instead of all at once.
 *   - `metadata` — optional description/project/logo strings stored on-chain as plain text.
 * @param sourceAddress - Address of the wallet creating (and paying for) the lock; becomes `creator`.
 * @param signTransaction - Callback that signs the built transaction XDR with the user's wallet
 *   (e.g. Freighter) and returns the signed XDR.
 * @param onProgress - Optional callback invoked with each {@link TxPhase} as the transaction
 *   is built, signed, submitted, and confirmed.
 * @returns The newly created lock's `id` and the submission `txHash`.
 * @throws {Error} Wrapping one of the contract's `ContractError` variants surfaced via simulation
 *   or transaction failure, notably:
 *   - `AmountMustBePositive` (1) — `amount` is zero or negative.
 *   - `UnlockMustBeFuture` (2) — `unlockAt` is not after the current ledger time.
 *   - `VestingEndBeforeStart` (7) — `vesting.end <= vesting.start`.
 *   - `RateLimitExceeded` (11) — `sourceAddress` created a lock too recently (cooldown).
 * @throws {Error} `Simulation error: ...` / `Send error: ...` / `Transaction failed: ...` for
 *   RPC, network, or unrelated on-chain execution failures (e.g. insufficient token balance).
 */
export async function createTokenLock(
  args: CreateTokenLockArgs,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<{ id: string; txHash: string }> {
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

  const { result: id, txHash } = await submitCallWithHash<bigint>(
    CONTRACTS.tokenLocker,
    "create_lock",
    scArgs,
    sourceAddress,
    signTransaction,
    onProgress,
  )

  return { id: String(id), txHash }
}

/**
 * Withdraw the releasable amount of a lock. Callable only by the lock's current
 * `beneficiary` (`beneficiary.require_auth()` on-chain) once `unlockAt` has passed.
 * For vesting locks this releases only the currently-vested-but-unreleased portion
 * and may be called repeatedly as more of the schedule vests; for non-vesting locks
 * it releases the full amount and marks the lock withdrawn.
 *
 * @param id - Numeric lock id (as a decimal string).
 * @param sourceAddress - Address submitting the transaction; must equal the lock's `beneficiary`.
 * @param signTransaction - Callback that signs the built transaction XDR and returns signed XDR.
 * @param onProgress - Optional callback invoked with each {@link TxPhase} during submission.
 * @returns The submission `txHash`.
 * @throws {Error} Wrapping one of the contract's `ContractError` variants, notably:
 *   - `AlreadyWithdrawn` (3) — the lock has already been fully withdrawn.
 *   - `StillLocked` (4) — called before `unlockAt`.
 *   - `NothingToRelease` (5) — nothing has vested since the last withdrawal (vesting locks only).
 * @throws {Error} `Simulation error: ...` / `Send error: ...` / `Transaction failed: ...` if
 *   `sourceAddress` fails `require_auth` as beneficiary, or for RPC/network failures.
 */
export async function withdrawLock(
  id: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<{ txHash: string }> {
  const { txHash } = await submitCallWithHash<void>(
    CONTRACTS.tokenLocker,
    "withdraw",
    [idArg(id)],
    sourceAddress,
    signTransaction,
    onProgress,
  )
  return { txHash }
}

/**
 * Transfer the beneficiary role of a lock to a new address. Callable only by the
 * lock's current `beneficiary` (`beneficiary.require_auth()` on-chain); the creator
 * cannot reassign the beneficiary. Updates the on-chain `ByBeneficiary` index so the
 * new beneficiary's lock listings include this lock and the old beneficiary's do not.
 *
 * @param id - Numeric lock id (as a decimal string).
 * @param newBeneficiary - Stellar address to become the new beneficiary.
 * @param sourceAddress - Address submitting the transaction; must equal the lock's current `beneficiary`.
 * @param signTransaction - Callback that signs the built transaction XDR and returns signed XDR.
 * @param onProgress - Optional callback invoked with each {@link TxPhase} during submission.
 * @returns Resolves with no value on success.
 * @throws {Error} Wrapping one of the contract's `ContractError` variants, notably:
 *   - `AlreadyWithdrawn` (3) — the lock has already been withdrawn and can no longer be reassigned.
 * @throws {Error} `Simulation error: ...` / `Send error: ...` / `Transaction failed: ...` if
 *   `sourceAddress` fails `require_auth` as beneficiary, or for RPC/network failures.
 */
export async function transferBeneficiary(
  id: string,
  newBeneficiary: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<void> {
  await submitCall(
    CONTRACTS.tokenLocker,
    "transfer_beneficiary",
    [idArg(id), addressArg(newBeneficiary)],
    sourceAddress,
    signTransaction,
    onProgress,
  )
}

/**
 * Push a lock's unlock date further into the future. Callable only by the lock's
 * `creator` (`creator.require_auth()` on-chain); the new date must be strictly later
 * than the current `unlockAt`. Increments the lock's `extendedCount`.
 *
 * @param id - Numeric lock id (as a decimal string).
 * @param newUnlockAt - New unlock unix-second timestamp; must be greater than the lock's current `unlockAt`.
 * @param sourceAddress - Address submitting the transaction; must equal the lock's `creator`.
 * @param signTransaction - Callback that signs the built transaction XDR and returns signed XDR.
 * @param onProgress - Optional callback invoked with each {@link TxPhase} during submission.
 * @returns The submission `txHash`.
 * @throws {Error} Wrapping one of the contract's `ContractError` variants, notably:
 *   - `AlreadyWithdrawn` (3) — the lock has already been withdrawn.
 *   - `CanOnlyExtend` (6) — `newUnlockAt` is not strictly later than the current `unlockAt`.
 * @throws {Error} `Simulation error: ...` / `Send error: ...` / `Transaction failed: ...` if
 *   `sourceAddress` fails `require_auth` as creator, or for RPC/network failures.
 */
export async function extendLock(
  id: string,
  newUnlockAt: number,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<{ txHash: string }> {
  const { txHash } = await submitCallWithHash<void>(
    CONTRACTS.tokenLocker,
    "extend",
    [idArg(id), nativeToScVal(BigInt(Math.floor(newUnlockAt)), { type: "u64" })],
    sourceAddress,
    signTransaction,
    onProgress,
  )
  return { txHash }
}
