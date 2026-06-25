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

export const STELLAR_DECIMALS = 1e7 // Stellar tokens use 7 decimal places
const POLL_INTERVAL_MS = 1500

// ── RPC client ────────────────────────────────────────────────────────────────

let _rpc: SorobanRpc.Server | null = null
export function getRpc(): SorobanRpc.Server {
  if (!_rpc) _rpc = new SorobanRpc.Server(NETWORK.rpcUrl, { allowHttp: false })
  return _rpc
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
  const rpc = getRpc()

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

  const result = await rpc.simulateTransaction(tx)
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

  const MAX_POLL_ATTEMPTS = 40
  let getResult = await rpc.getTransaction(sendResult.hash)
  for (let attempts = 0; getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND; attempts++) {
    if (attempts >= MAX_POLL_ATTEMPTS) {
      throw new Error(`Transaction ${sendResult.hash} not found after ${MAX_POLL_ATTEMPTS} attempts (~60s)`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
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
  return Number(raw ?? 0n) / STELLAR_DECIMALS
}

// ── Utils ─────────────────────────────────────────────────────────────────────

export function explorerLink(address: string): string {
  return `https://stellar.expert/explorer/${NETWORK.networkName}/contract/${address}`
}
