import {
  Address,
  Contract,
  Networks,
  rpc as SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
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

// Soroban transactions need a higher base fee than classic Stellar
const SOROBAN_FEE = "1000000" // 0.1 XLM — covers resource fees

export const STELLAR_DECIMALS = 1e7 // Stellar tokens use 7 decimal places
const POLL_INTERVAL_MS = 1500
const MAX_CONCURRENT = 5
const MAX_RETRIES = 3
const CACHE_TTL_MS = 10_000

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

  constructor(rpcUrl: string) {
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false })
  }

  getServer(): SorobanRpc.Server {
    return this.server
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

    const promise = this.retrySimulate(tx)
      .then((data) => {
        if (cacheTtlMs > 0) {
          this.cache.set(key, { data, expiry: Date.now() + cacheTtlMs })
        }
        this.inflight.delete(key)
        return data
      })
      .catch((err) => {
        this.inflight.delete(key)
        throw err
      })

    this.inflight.set(key, promise)
    return promise
  }

  invalidateCache(): void {
    this.cache.clear()
    // In-flight requests are not cancelled; stale results will simply not be
    // re-cached because the next simulate() call will miss a cold cache.
  }
}

let _client: RpcClient | null = null
function getClient(): RpcClient {
  if (!_client) _client = new RpcClient(NETWORK.rpcUrl)
  return _client
}

// Shared RPC server instance used by the read/write helpers below
function getRpc(): SorobanRpc.Server {
  return getClient().getServer()
}

// Invalidate read cache after mutations (create, withdraw, extend)
export function invalidateRpcCache(): void {
  getClient().invalidateCache()
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
    throw new Error(`Transaction failed: ${JSON.stringify(getResult)}`)
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
  const rpc = getRpc()
  const account = await rpc.getAccount(sourceAddress)
  const contract = new Contract(contractId)

  const tx = new TransactionBuilder(account, {
    fee: SOROBAN_FEE,
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
  const rpc = getRpc()

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

  const result = await rpc.simulateTransaction(tx)
  log.debug("[estimateLockCost]", { method, result })

  if (SorobanRpc.Api.isSimulationError(result)) {
    throw new Error(`Cost simulation failed: ${simError(result)}`)
  }

  const minResourceFee = Number((result as { minResourceFee?: string }).minResourceFee ?? "0")
  // Issue #1074: submitCall actually pays SOROBAN_FEE, not BASE_FEE — using
  // BASE_FEE here understated the pre-signing estimate by ~0.1 XLM versus
  // what the user is really charged.
  const networkFee = Number(SOROBAN_FEE) / 1e7
  const resourceFee = minResourceFee / 1e7
  return { networkFee, resourceFee, total: networkFee + resourceFee }
}

// ── Token helpers ────────────────────────────────────────────────────────────

export async function getTokenBalance(tokenAddress: string, owner: string): Promise<number> {
  const raw = await simulateCall<bigint>(tokenAddress, "balance", [new Address(owner).toScVal()])
  const { decimals } = await getOnChainTokenMeta(tokenAddress)
  return Number(raw ?? 0n) / 10 ** decimals
}

export async function getTokenAllowance(tokenAddress: string, owner: string, spender: string): Promise<number> {
  const raw = await simulateCall<bigint>(tokenAddress, "allowance", [
    new Address(owner).toScVal(),
    new Address(spender).toScVal(),
  ])
  const { decimals } = await getOnChainTokenMeta(tokenAddress)
  return Number(raw ?? 0n) / 10 ** decimals
}

export async function submitTokenApproval(
  tokenAddress: string,
  owner: string,
  spender: string,
  amount: number,
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<void> {
  // Issue #740: was hardcoded to 7 decimals regardless of the token's real
  // decimals(), breaking the approve-then-lock flow for any token that
  // isn't 7 decimals.
  const { decimals } = await getOnChainTokenMeta(tokenAddress)
  const amountStroops = BigInt(Math.round(amount * 10 ** decimals))
  const expirationLedger = 0

  const scArgs: xdr.ScVal[] = [
    new Address(owner).toScVal(),
    new Address(spender).toScVal(),
    nativeToScVal(amountStroops, { type: "i128" }),
    nativeToScVal(expirationLedger, { type: "u32" }),
  ]

  await submitCall(tokenAddress, "approve", scArgs, sourceAddress, signTransaction)
}

// ── Utils ─────────────────────────────────────────────────────────────────────

export function explorerLink(address: string): string {
  return `https://stellar.expert/explorer/${NETWORK.networkName}/contract/${address}`
}
