import {
  Address,
  Contract,
  Networks,
  Operation,
  rpc as SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk"

import { getContractAddress } from "@/lib/contracts.generated"
import { createLogger } from "@/lib/logger"
import { getOnChainTokenMeta } from "@/lib/token-metadata"
import { resolveNetworkKey } from "@/lib/network-key"

const log = createLogger("stellar")

// Issue #742: derive from the shared resolveNetworkKey() instead of
// re-implementing the testnet/staging/mainnet mapping here — this used to
// treat "staging" as testnet while useVerifiedToken treated it as mainnet,
// a real cross-module inconsistency (staging deploys against mainnet
// contracts, so its RPC/passphrase must match).
const isMainnet = resolveNetworkKey() === "mainnet"

const defaultRpcUrl = isMainnet ? "https://soroban-mainnet.stellar.org" : "https://soroban-testnet.stellar.org"
const defaultHorizonUrl = isMainnet ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org"

export const NETWORK = {
  id: isMainnet ? "mainnet" : "testnet",
  passphrase: isMainnet ? Networks.PUBLIC : Networks.TESTNET,
  rpcUrl: import.meta.env.VITE_RPC_URL || defaultRpcUrl,
  horizonUrl: import.meta.env.VITE_HORIZON_URL || defaultHorizonUrl,
  networkName: isMainnet ? "public" : "testnet",
  displayName: isMainnet ? "Mainnet" : "Testnet",
}

export const CONTRACTS = {
  tokenLocker: getContractAddress("token-locker"),
  lpLocker: getContractAddress("lp-locker"),
}

// Issue #1073: a flat 0.1 XLM inclusion fee overpaid users on every Soroban
// transaction even when the network wasn't congested. getInclusionFee() below
// derives the real fee from getFeeStats(), clamped to this range: never bid
// below BASE_FEE (the network minimum), never above the old hardcoded value
// (the previous worst case, kept as a safety ceiling if fee stats look odd).
const MIN_INCLUSION_FEE = Number(BASE_FEE)
const MAX_INCLUSION_FEE = 1_000_000 // 0.1 XLM — previous hardcoded fee, now just the cap
const FEE_STATS_TTL_MS = 30_000

export const STELLAR_DECIMALS = 1e7 // Stellar tokens use 7 decimal places
const POLL_INTERVAL_MS = 1500
const MAX_CONCURRENT = 5
const MAX_RETRIES = 3
const CACHE_TTL_MS = 10_000
// Upper bound on the response cache so keys that are written once and never
// read again (e.g. one-off lock lookups) can't grow the Map forever over a
// long Explorer/Discover session. Expired entries are also swept on every
// write, rather than only being skipped-over on read.
const CACHE_MAX_ENTRIES = 200
// Issue #1075: short-lived cache for cost estimates — long enough to dedupe a
// burst of identical-args calls (e.g. React re-renders), short enough that the
// estimate never goes stale while the user is actively editing the form.
const ESTIMATE_CACHE_TTL_MS = 3_000

// Issue #1072: 30s was too tight for the submit tx — if the user takes more
// than ~30s to review/approve in their wallet (easy with Freighter, routine
// with a hardware wallet), the tx's timebounds expire before it's even
// submitted and the network rejects it with txTooLate. A few minutes gives
// wallets a realistic review window without the tx staying valid "forever".
const SOROBAN_TX_TIMEOUT_SECONDS = 180

// Issue #1071: how many times to retry a send that comes back
// TRY_AGAIN_LATER (network congestion, tx never accepted) before giving up.
const MAX_SEND_RETRIES = 3
const SEND_RETRY_BACKOFF_MS = 1500

/** Phase reported via the onProgress callback during submitCall. */
export type TxPhase = "simulating" | "signing" | "submitting" | "confirming"

// ── RPC client ────────────────────────────────────────────────────────────────

type SimulateArg = Parameters<SorobanRpc.Server["simulateTransaction"]>[0]

class RpcClient {
  private readonly server: SorobanRpc.Server
  // In-flight deduplication: cache key → promise
  private readonly inflight = new Map<string, Promise<SorobanRpc.Api.SimulateTransactionResponse>>()
  // Response cache: cache key → { data, expiry }
  private readonly cache = new Map<string, { data: SorobanRpc.Api.SimulateTransactionResponse; expiry: number }>()
  private activeCount = 0
  private readonly queue: Array<() => void> = []
  // Bumped on every invalidateCache(). simulate() snapshots this at call time
  // and only writes its result into the cache if it's still current — this is
  // what keeps a simulation started before invalidation from writing stale
  // data into the cache after the mutation that triggered the invalidation.
  private generation = 0

  constructor(rpcUrl: string) {
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false })
  }

  getServer(): SorobanRpc.Server {
    return this.server
  }

  get cacheSize(): number {
    return this.cache.size
  }

  // Removes every entry whose TTL has already lapsed. Expiry was previously
  // only checked on read, so a key that's written once and never read again
  // (a common pattern for one-off lock-detail lookups) would sit in the Map
  // forever — this runs on every write instead, so it can't accumulate.
  private evictExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (entry.expiry <= now) {
        this.cache.delete(key)
      }
    }
  }

  // Backstop against unbounded growth even when nothing has expired yet
  // (e.g. many distinct short-TTL keys written in quick succession). Map
  // preserves insertion order, so the oldest-written entries are evicted
  // first — a simple FIFO/LRU-ish cap, not a strict LRU.
  private enforceMaxSize(): void {
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey === undefined) break
      this.cache.delete(oldestKey)
    }
  }

  private async withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount < MAX_CONCURRENT) {
      this.activeCount++
      try {
        return await fn()
      } finally {
        this.activeCount--
        const next = this.queue.shift()
        if (next) next()
      }
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        void (async () => {
          this.activeCount++
          try {
            resolve(await fn())
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)))
          } finally {
            this.activeCount--
            const next = this.queue.shift()
            if (next) next()
          }
        })()
      })
    })
  }

  private async retrySimulate(tx: SimulateArg): Promise<SorobanRpc.Api.SimulateTransactionResponse> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.withConcurrencyLimit(() => this.server.simulateTransaction(tx))
      } catch (err) {
        lastErr = err
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
        }
      }
    }
    throw lastErr
  }

  // cacheKey must be caller-supplied rather than derived from tx.toXDR():
  // TransactionBuilder.setTimeout() bakes the current wall-clock time into
  // timeBounds.maxTime, so the XDR of an otherwise-identical call changes
  // every second and would defeat both caching and dedup almost entirely.
  async simulate(
    tx: SimulateArg,
    cacheKey: string,
    cacheTtlMs = CACHE_TTL_MS,
  ): Promise<SorobanRpc.Api.SimulateTransactionResponse> {
    const key = cacheKey

    // Cache hit
    const cached = this.cache.get(key)
    if (cached && cached.expiry > Date.now()) {
      return cached.data
    }

    // Dedup in-flight
    const existing = this.inflight.get(key)
    if (existing) return existing

    // Snapshot the current generation. If invalidateCache() runs before this
    // simulation resolves, this.generation will have moved on, and the stale
    // result below is discarded instead of being written into the cache.
    const gen = this.generation

    const promise = this.retrySimulate(tx)
      .then((data) => {
        if (cacheTtlMs > 0) {
          this.evictExpired()
          this.cache.set(key, { data, expiry: Date.now() + cacheTtlMs })
          this.enforceMaxSize()
        if (gen === this.generation) {
          if (cacheTtlMs > 0) {
            this.cache.set(key, { data, expiry: Date.now() + cacheTtlMs })
          }
          // Only clear our own in-flight entry — invalidateCache() may have
          // already cleared it (and a newer call for the same key may have
          // since taken the slot).
          if (this.inflight.get(key) === promise) this.inflight.delete(key)
        }
        return data
      })
      .catch((err) => {
        if (gen === this.generation && this.inflight.get(key) === promise) this.inflight.delete(key)
        throw err
      })

    this.inflight.set(key, promise)
    return promise
  }

  invalidateCache(): void {
    this.cache.clear()
    this.feeStatsCache = null
    // In-flight requests are not cancelled; stale results will simply not be
    // re-cached because the next simulate() call will miss a cold cache.
    // Drop tracking of any in-flight requests too: they're still running (we
    // don't cancel underlying network calls), but bumping the generation
    // below means their eventual result is never written into the cache,
    // and clearing this map means a repeat call made right after invalidation
    // starts its own fresh request instead of piggy-backing on the stale one.
    this.inflight.clear()
    this.generation++
  }

  private feeStatsCache: { fee: string; expiry: number } | null = null

  // Issue #1073: derive the inclusion fee from the network's recent Soroban
  // fee distribution (p50) instead of a flat hardcoded value, clamped to
  // [MIN_INCLUSION_FEE, MAX_INCLUSION_FEE]. Falls back to the cap if
  // getFeeStats() fails or returns something unusable — overpaying slightly
  // is safer than guessing too low and leaving the transaction stuck.
  async getInclusionFee(): Promise<string> {
    const cached = this.feeStatsCache
    if (cached && cached.expiry > Date.now()) {
      return cached.fee
    }

    let fee = MAX_INCLUSION_FEE
    try {
      const stats = await this.server.getFeeStats()
      const p50 = Number(stats.sorobanInclusionFee?.p50 ?? stats.inclusionFee?.p50 ?? NaN)
      if (Number.isFinite(p50) && p50 > 0) {
        fee = Math.min(MAX_INCLUSION_FEE, Math.max(MIN_INCLUSION_FEE, p50))
      }
    } catch (err) {
      log.debug("[getInclusionFee] getFeeStats failed, using fallback fee", { err })
    }

    const feeStr = String(fee)
    this.feeStatsCache = { fee: feeStr, expiry: Date.now() + FEE_STATS_TTL_MS }
    return feeStr
  }
}

let _client: RpcClient | null = null
function getClient(): RpcClient {
  if (!_client) _client = new RpcClient(NETWORK.rpcUrl)
  return _client
}

// Invalidate read cache after mutations (create, withdraw, extend)
export function invalidateRpcCache(): void {
  getClient().invalidateCache()
}

// Exposed for tests/diagnostics: current size of the response cache, so
// growth over a long session can be asserted to stay bounded.
export function getRpcCacheSize(): number {
  return getClient().cacheSize
}

function simError(result: unknown): string {
  // Extract a readable string from whatever shape the sim error takes
  if (!result || typeof result !== "object") return String(result)
  const r = result as Record<string, unknown>
  if (typeof r.error === "string") return r.error
  if (typeof r.error === "object") return JSON.stringify(r.error)
  return JSON.stringify(r)
}

// Issue #1072: distinguishes "the tx's timebounds expired before/while
// submitting" (txTooLate) from every other send failure, so callers can be
// given a clear, actionable retry message instead of a raw XDR dump.
function isTxTooLateError(errorResult: xdr.TransactionResult | undefined): boolean {
  if (!errorResult) return false
  try {
    return errorResult.result().switch().name === "txTooLate"
  } catch {
    // Defensive: if this ever runs against an SDK build whose XDR shape
    // differs, fall back to the generic send-error message rather than
    // throwing from inside a best-effort classification helper.
    return false
  }
// ── Failed-transaction decoding (issue #1076) ─────────────────────────────────
//
// Unlike simulateTransaction's response (which carries a ready-made `error`
// string such as "Error(Contract, #4)"), a FAILED getTransaction response
// never does — resultXdr only carries the coarse transaction/operation result
// code (e.g. "txFailed"), not which contract variant failed. The specific
// contract error code only survives in the diagnostic events the host
// attaches to the failed call, as an ScVal of type scvError.

/**
 * Scans diagnostic events for a Soroban contract error (ScError::Contract(N))
 * and returns its numeric code, or null if none is present.
 */
function findContractErrorCode(diagnosticEvents: xdr.DiagnosticEvent[] | undefined): number | null {
  if (!diagnosticEvents) return null
  for (const diagEvent of diagnosticEvents) {
    try {
      const data = diagEvent.event().body().v0().data()
      if (data.switch().name !== "scvError") continue
      const scError = data.error()
      if (scError.switch().name === "sceContract") {
        return scError.contractCode()
      }
    } catch {
      // Malformed/unexpected event shape — skip it rather than fail the whole decode.
    }
  }
  return null
}

/**
 * Builds a short, parseError()-mappable message for a FAILED getTransaction
 * response. Never includes the raw XDR/JSON blob: the old
 * `JSON.stringify(getResult)` message was unreadable, could throw on
 * embedded BigInt/XDR objects, and never let the contract error code reach
 * parseError.
 */
export function describeFailedTransaction(getResult: SorobanRpc.Api.GetFailedTransactionResponse, hash: string): string {
  const contractCode = findContractErrorCode(getResult.diagnosticEventsXdr)
  if (contractCode !== null) {
    return `Transaction failed: Error(Contract, #${contractCode})`
  }

  try {
    const resultCode = getResult.resultXdr?.result?.().switch?.().name
    if (resultCode) {
      return `Transaction failed: ${resultCode} (tx ${hash})`
    }
  } catch {
    // fall through to the generic message below
  }

  return `Transaction failed (tx ${hash})`
}

// ── Simulate (read-only) ──────────────────────────────────────────────────────

export async function simulateCall<T>(contractId: string, method: string, args: xdr.ScVal[]): Promise<T> {
  const client = getClient()

  const dummySource = {
    accountId: () => "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    sequenceNumber: () => "0",
    incrementSequenceNumber: () => {},
  }

  const contract = new Contract(contractId)
  const tx = new TransactionBuilder(dummySource, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const cacheKey = `${contractId}:${method}:${args.map((a) => a.toXDR("base64")).join(",")}`
  const result = await client.simulate(tx, cacheKey)
  log.debug("[simulateCall]", { method, result })

  if (SorobanRpc.Api.isSimulationError(result)) {
    throw new Error(`Simulation error: ${simError(result)}`)
  }

  const retval = result.result?.retval
  if (!retval) return undefined as T
  return scValToNative(retval) as T
}

// ── Submit (write) ────────────────────────────────────────────────────────────

type SendArg = Parameters<SorobanRpc.Server["sendTransaction"]>[0]

// Issue #1071: a plain "await sendTransaction()" only distinguished ERROR
// from everything else, so TRY_AGAIN_LATER (network congestion — the tx was
// never accepted by this node) fell through to the getTransaction poll below
// and spent ~60s producing a confusing "not found after 40 attempts" error.
// Retrying the send itself (with backoff) is cheap and usually clears up
// congestion without the caller ever seeing an error.
async function sendWithRetry(rpc: SorobanRpc.Server, tx: SendArg): Promise<SorobanRpc.Api.SendTransactionResponse> {
  let result: SorobanRpc.Api.SendTransactionResponse
  for (let attempt = 0; ; attempt++) {
    result = await rpc.sendTransaction(tx)
    if (result.status !== "TRY_AGAIN_LATER" || attempt >= MAX_SEND_RETRIES) {
      return result
    }
    await new Promise((r) => setTimeout(r, SEND_RETRY_BACKOFF_MS * 2 ** attempt))
export async function submitCall<T = void>(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<T> {
  const client = getClient()
  const rpc = client.getServer()
  const account = await rpc.getAccount(sourceAddress)
  const contract = new Contract(contractId)
  const fee = await client.getInclusionFee()

  const tx = new TransactionBuilder(account, {
    fee,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  onProgress?.("simulating")
  const simResult = await rpc.simulateTransaction(tx)
  log.debug("[submitCall sim]", { method, simResult })

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation error: ${simError(simResult)}`)
  }
}

// Issue #1071: classifies a sendTransaction response and either returns the
// hash to poll or throws a clear, status-specific error. Exported (on top of
// being used by submitCallWithHash below) so each status's handling can be
// unit-tested directly, without needing to drive a full build/simulate/sign
// pipeline just to produce a SendTransactionResponse.
export function resolveSendResult(sendResult: SorobanRpc.Api.SendTransactionResponse): string {
  if (sendResult.status === "ERROR") {
    if (isTxTooLateError(sendResult.errorResult)) {
      throw new Error("Transaction expired before it could be submitted — signing took too long. Please try again.")
    }
    throw new Error(`Send error: ${sendResult.errorResult?.toXDR("base64") ?? "unknown"}`)
  }
  if (sendResult.status === "TRY_AGAIN_LATER") {
    throw new Error(
      "The Stellar network is busy and didn't accept the transaction after several attempts. Please try again in a moment.",
    )
  }
  // PENDING and DUPLICATE both mean the hash is (or will be) tracked
  // on-chain — DUPLICATE just means this exact tx was already submitted —
  // so both are handled the same way: poll the hash below.
  return sendResult.hash
}

async function pollTransaction<T>(rpc: SorobanRpc.Server, hash: string): Promise<T> {
  const MAX_POLL_ATTEMPTS = 40
  let getResult = await rpc.getTransaction(hash)
  for (let attempts = 0; getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND; attempts++) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      throw new Error(`Transaction ${hash} not found after ${MAX_POLL_ATTEMPTS} attempts (~60s)`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    getResult = await rpc.getTransaction(hash)
  }
  log.debug("[pollTransaction result]", { hash, getResult })

  if (getResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(describeFailedTransaction(getResult, sendResult.hash))
  }

  return getResult.returnValue ? (scValToNative(getResult.returnValue) as T) : (undefined as T)
}

// Issue #1070: this used to be ~70 lines duplicated almost verbatim between
// submitCall and submitCallWithHash — identical build/simulate/sign/send/poll,
// differing only in whether the hash was returned — so every bug fix (the
// timeout and send-status handling above included) had to be made twice.
// submitCallWithHash is now the one real implementation; submitCall below is
// a thin wrapper that just drops the hash.
export async function submitCallWithHash<T = void>(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<{ result: T; txHash: string }> {
  const client = getClient()
  const rpc = client.getServer()
  const account = await rpc.getAccount(sourceAddress)
  const contract = new Contract(contractId)
  const fee = await client.getInclusionFee()

  const tx = new TransactionBuilder(account, {
    fee,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(SOROBAN_TX_TIMEOUT_SECONDS)
    .build()

  onProgress?.("simulating")
  const simResult = await rpc.simulateTransaction(tx)
  log.debug("[submitCallWithHash sim]", { method, simResult })

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation error: ${simError(simResult)}`)
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build()

  onProgress?.("signing")
  const { signedTxXdr } = await signTransaction(preparedTx.toXDR())

  onProgress?.("submitting")
  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK.passphrase)
  const sendResult = await sendWithRetry(rpc, signedTx)
  log.debug("[submitCallWithHash send]", { sendResult })

  // See resolveSendResult: ERROR and an exhausted TRY_AGAIN_LATER mean the
  // transaction was never accepted and fail fast here; PENDING/DUPLICATE
  // return the hash to poll below.
  const txHash = resolveSendResult(sendResult)

  // Invalidate read cache now that a mutation has been submitted successfully
  invalidateRpcCache()

  onProgress?.("confirming")
  const result = await pollTransaction<T>(rpc, txHash)
  const MAX_POLL_ATTEMPTS = 40
  let getResult = await rpc.getTransaction(txHash)
  for (let attempts = 0; getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND; attempts++) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      throw new Error(`Transaction ${txHash} not found after ${MAX_POLL_ATTEMPTS} attempts (~60s)`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    getResult = await rpc.getTransaction(txHash)
  }

  if (getResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(describeFailedTransaction(getResult, txHash))
  }

  const result = getResult.returnValue ? (scValToNative(getResult.returnValue) as T) : (undefined as T)
  return { result, txHash }
}

/** Same as submitCallWithHash, but only returns the call's result (no hash). */
export async function submitCall<T = void>(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<T> {
  const { result } = await submitCallWithHash<T>(contractId, method, args, sourceAddress, signTransaction, onProgress)
  return result
}

// ── Address helpers ─────────────────────────────────────────────────────────

// Defined in @/lib/stellar-address so they can be imported without pulling in the
// env validation and RPC client this module sets up at import time.
export { isValidStellarAddress, isValidStellarContractAddress, isValidStellarPublicKey } from "@/lib/stellar-address"

// ── Cost estimation ───────────────────────────────────────────────────────────

export interface LockCostEstimate {
  networkFee: number // in XLM
  resourceFee: number // in XLM (storage deposit + compute)
  total: number // in XLM
}

export async function estimateLockCost(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<LockCostEstimate> {
  const client = getClient()

  const dummySource = {
    accountId: () => "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    sequenceNumber: () => "0",
    incrementSequenceNumber: () => {},
  }

  const contract = new Contract(contractId)
  const tx = new TransactionBuilder(dummySource, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  // Issue #1075: this used to call rpc.simulateTransaction directly,
  // bypassing the shared client's retry/concurrency limits — typing in the
  // amount field fired unthrottled simulations. Route through the client
  // like every other simulation, with a short cache TTL so the estimate
  // can't go stale while still deduping bursts of identical-args calls.
  const cacheKey = `estimate:${contractId}:${method}:${args.map((a) => a.toXDR("base64")).join(",")}`
  const result = await client.simulate(tx, cacheKey, ESTIMATE_CACHE_TTL_MS)
  log.debug("[estimateLockCost]", { method, result })

  if (SorobanRpc.Api.isSimulationError(result)) {
    throw new Error(`Cost simulation failed: ${simError(result)}`)
  }

  const minResourceFee = Number((result as { minResourceFee?: string }).minResourceFee ?? "0")
  // Issue #1074: submitCall actually pays SOROBAN_FEE, not BASE_FEE — using
  // BASE_FEE here understated the pre-signing estimate by ~0.1 XLM versus
  // what the user is really charged.
  const networkFee = Number(SOROBAN_FEE) / 1e7
  // Issue #1073: reflect the actual network-derived inclusion fee instead of
  // the flat BASE_FEE, so the estimate matches what submitCall will charge.
  const networkFee = Number(await client.getInclusionFee()) / 1e7
  const resourceFee = minResourceFee / 1e7
  return { networkFee, resourceFee, total: networkFee + resourceFee }
}

// ── Token helpers ────────────────────────────────────────────────────────────

export async function getTokenBalance(tokenAddress: string, owner: string): Promise<number> {
  const raw = await simulateCall<bigint>(tokenAddress, "balance", [new Address(owner).toScVal()])
  const { decimals } = await getOnChainTokenMeta(tokenAddress)
  return Number(raw ?? 0n) / 10 ** decimals
}

// ── Utils ─────────────────────────────────────────────────────────────────────

export function explorerLink(address: string): string {
  return `https://stellar.expert/explorer/${NETWORK.networkName}/contract/${address}`
}

// ── Archived-entry helpers ────────────────────────────────────────────────────

/**
 * Returns true when a simulation (or any error thrown by simulateCall) signals
 * that the target ledger entry has been archived by the Soroban network — i.e.
 * its persistent-storage TTL expired and the entry now lives in the cold archive
 * rather than the active ledger.
 *
 * The two detection paths:
 *  1. The RPC returns a SimulateTransactionResponse with a non-empty
 *     `restorePreamble` field — this is the official SDK signal.
 *  2. The error message contains the string "ExpirationLedgerSeq" or
 *     "entry is archived" — a fallback for edge-case error shapes.
 */
export function isArchivedError(err: unknown): boolean {
  if (!err) return false

  // Path 1 — structured simulation response attached to the error
  if (typeof err === "object" && err !== null) {
    const r = err as Record<string, unknown>
    // Some callers re-throw the raw SimulateTransactionResponse as the error
    if (
      r.restorePreamble &&
      typeof r.restorePreamble === "object" &&
      (r.restorePreamble as Record<string, unknown>).transactionData
    ) {
      return true
    }
  }

  // Path 2 — string message heuristic
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("ExpirationLedgerSeq") || msg.includes("entry is archived") || msg.includes("restorePreamble")
}

/**
 * Submit a Soroban `RestoreFootprint` transaction for a single contract
 * persistent-storage entry identified by `contractId` + `DataKey::Lock(id)`.
 *
 * How it works:
 *  1. Attempt a simulation of `get_lock(id)` against the target contract.
 *  2. The simulation will fail with a `restorePreamble` because the entry is
 *     archived; we extract that preamble's `transactionData` as the footprint.
 *  3. Build a transaction containing `Operation.restoreFootprint()` with that
 *     footprint, assemble resource fees, sign, submit, and poll for confirmation.
 *
 * @param contractId - The locker contract whose lock entry needs restoring.
 * @param id         - Lock id (u64 as decimal string) to restore.
 * @param sourceAddress - Wallet address submitting + paying for the restore tx.
 * @param signTransaction - Freighter (or compatible) sign callback.
 * @param onProgress - Optional phase callback for UI progress steps.
 * @returns `{ txHash }` on success.
 * @throws if the entry is not actually archived, or for any RPC/network failure.
 */
export async function submitRestoreFootprint(
  contractId: string,
  id: string,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
  onProgress?: (phase: TxPhase) => void,
): Promise<{ txHash: string }> {
  const rpc = getRpc()

  // Step 1 — simulate get_lock to obtain the archived footprint
  onProgress?.("simulating")

  const dummySource = {
    accountId: () => sourceAddress,
    sequenceNumber: () => "0",
    incrementSequenceNumber: () => {},
  }

  const contract = new Contract(contractId)
  const probeTx = new TransactionBuilder(dummySource, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(contract.call("get_lock", nativeToScVal(BigInt(id), { type: "u64" })))
    .setTimeout(30)
    .build()

  const simResult = await rpc.simulateTransaction(probeTx)
  log.debug("[submitRestoreFootprint sim]", { simResult })

  // The simulation must come back with a restorePreamble for an archived entry
  const preamble = (simResult as Record<string, unknown>).restorePreamble as
    | { transactionData: string | xdr.SorobanTransactionData }
    | undefined

  if (!preamble?.transactionData) {
    throw new Error(
      "Lock entry is not archived — RestoreFootprint is not needed. " +
        "If the lock simply does not exist, check the lock ID.",
    )
  }

  // Step 2 — build the restore transaction from the preamble's footprint
  const account = await rpc.getAccount(sourceAddress)

  const sorobanData =
    typeof preamble.transactionData === "string"
      ? xdr.SorobanTransactionData.fromXDR(preamble.transactionData, "base64")
      : preamble.transactionData

  const restoreTx = new TransactionBuilder(account, {
    fee: SOROBAN_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(Operation.restoreFootprint({}))
    .setSorobanData(sorobanData)
    .setTimeout(30)
    .build()

  // Simulate again to get accurate resource fees for the restore op itself
  const restoreSim = await rpc.simulateTransaction(restoreTx)
  if (SorobanRpc.Api.isSimulationError(restoreSim)) {
    throw new Error(`RestoreFootprint simulation failed: ${simError(restoreSim)}`)
  }

  const preparedTx = SorobanRpc.assembleTransaction(restoreTx, restoreSim).build()

  // Step 3 — sign + submit
  onProgress?.("signing")
  const { signedTxXdr } = await signTransaction(preparedTx.toXDR())

  onProgress?.("submitting")
  const sendResult = await rpc.sendTransaction(TransactionBuilder.fromXDR(signedTxXdr, NETWORK.passphrase))
  log.debug("[submitRestoreFootprint send]", { sendResult })

  if (sendResult.status === "ERROR") {
    throw new Error(`RestoreFootprint send error: ${sendResult.errorResult?.toXDR("base64") ?? "unknown"}`)
  }

  invalidateRpcCache()

  // Step 4 — poll for confirmation
  onProgress?.("confirming")
  const MAX_POLL_ATTEMPTS = 40
  let getResult = await rpc.getTransaction(sendResult.hash)
  for (let attempts = 0; getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND; attempts++) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      throw new Error(`RestoreFootprint tx ${sendResult.hash} not found after ${MAX_POLL_ATTEMPTS} attempts (~60s)`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    getResult = await rpc.getTransaction(sendResult.hash)
  }

  if (getResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`RestoreFootprint tx failed: ${JSON.stringify(getResult)}`)
  }

  return { txHash: sendResult.hash }
}
