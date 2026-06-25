import {
  Address,
  Contract,
  Networks,
  rpc as SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk"

const isMainnet = import.meta.env.VITE_NETWORK === "mainnet"

export const NETWORK = {
  passphrase: isMainnet ? Networks.PUBLIC : Networks.TESTNET,
  rpcUrl: import.meta.env.VITE_RPC_URL || "https://soroban-testnet.stellar.org",
  horizonUrl: import.meta.env.VITE_HORIZON_URL || "https://horizon-testnet.stellar.org",
  networkName: (isMainnet ? "public" : "testnet"),
}

export const CONTRACTS = {
  tokenLocker: import.meta.env.VITE_TOKEN_LOCKER_CONTRACT || "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW",
  lpLocker: import.meta.env.VITE_LP_LOCKER_CONTRACT || "CA3WYETNIF5IAF3VUNQ3SYKZFV45TOFBF7CEZ46I7QEBPWTRM73WLEI4",
}

// Soroban transactions need a higher base fee than classic Stellar
const SOROBAN_FEE = "1000000" // 0.1 XLM — covers resource fees

const MAX_CONCURRENT = 5
const MAX_RETRIES = 3
const CACHE_TTL_MS = 10_000

// ── RPC client ────────────────────────────────────────────────────────────────

type SimulateArg = Parameters<SorobanRpc.Server["simulateTransaction"]>[0]

class RpcClient {
  private readonly server: SorobanRpc.Server
  // In-flight deduplication: XDR key → promise
  private readonly inflight = new Map<string, Promise<SorobanRpc.Api.SimulateTransactionResponse>>()
  // Response cache: XDR key → { data, expiry }
  private readonly cache = new Map<string, { data: SorobanRpc.Api.SimulateTransactionResponse; expiry: number }>()
  private activeCount = 0
  private readonly queue: Array<() => void> = []

  constructor(rpcUrl: string) {
    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false })
  }

  getServer(): SorobanRpc.Server {
    return this.server
  }

  private cacheKey(tx: SimulateArg): string {
    return (tx as { toXDR(): string }).toXDR()
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
      this.queue.push(async () => {
        this.activeCount++
        try {
          resolve(await fn())
        } catch (e) {
          reject(e)
        } finally {
          this.activeCount--
          const next = this.queue.shift()
          if (next) next()
        }
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

  async simulate(tx: SimulateArg, cacheTtlMs = CACHE_TTL_MS): Promise<SorobanRpc.Api.SimulateTransactionResponse> {
    const key = this.cacheKey(tx)

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

// Keep backward-compat export used elsewhere in the codebase
export function getRpc(): SorobanRpc.Server {
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

// ── Simulate (read-only) ──────────────────────────────────────────────────────

export async function simulateCall<T>(contractId: string, method: string, args: xdr.ScVal[]): Promise<T> {
  const client = getClient()

  const dummySource = {
    accountId: () => "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
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

  const result = await client.simulate(tx)
  if (import.meta.env.DEV) console.log("[simulateCall]", method, result)

  if (SorobanRpc.Api.isSimulationError(result)) {
    throw new Error(`Simulation error: ${simError(result)}`)
  }

  const retval = (result).result?.retval
  if (!retval) return undefined as T
  return scValToNative(retval) as T
}

// ── Submit (write) ────────────────────────────────────────────────────────────

export async function submitCall(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string,
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>,
): Promise<void> {
  const rpc = getRpc()
  const account = await rpc.getAccount(sourceAddress)
  const contract = new Contract(contractId)

  const tx = new TransactionBuilder(account, {
    fee: SOROBAN_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const simResult = await rpc.simulateTransaction(tx)
  if (import.meta.env.DEV) console.log("[submitCall sim]", method, simResult)

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation error: ${simError(simResult)}`)
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build()

  const { signedTxXdr } = await signTransaction(preparedTx.toXDR())

  const sendResult = await rpc.sendTransaction(TransactionBuilder.fromXDR(signedTxXdr, NETWORK.passphrase))
  if (import.meta.env.DEV) console.log("[submitCall send]", sendResult)

  if (sendResult.status === "ERROR") {
    throw new Error(`Send error: ${sendResult.errorResult?.toXDR("base64") ?? "unknown"}`)
  }

  // Invalidate read cache now that a mutation has been submitted successfully
  invalidateRpcCache()

  const MAX_POLL_ATTEMPTS = 40
  let getResult = await rpc.getTransaction(sendResult.hash)
  for (let attempts = 0; getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND; attempts++) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      throw new Error(`Transaction ${sendResult.hash} not found after ${MAX_POLL_ATTEMPTS} attempts (~60s)`)
    }
    await new Promise((r) => setTimeout(r, 1500))
    getResult = await rpc.getTransaction(sendResult.hash)
  }
  if (import.meta.env.DEV) console.log("[submitCall result]", getResult)

  if (getResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`Transaction failed: ${JSON.stringify(getResult)}`)
  }
}

// ── Token helpers ────────────────────────────────────────────────────────────

export async function getTokenBalance(tokenAddress: string, owner: string): Promise<number> {
  const raw = await simulateCall<bigint>(tokenAddress, "balance", [new Address(owner).toScVal()])
  return Number(raw ?? 0n) / 1e7
}

// ── Utils ─────────────────────────────────────────────────────────────────────

export function explorerLink(address: string): string {
  return `https://stellar.expert/explorer/${NETWORK.networkName}/contract/${address}`
}
