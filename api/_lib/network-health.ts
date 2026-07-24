const envNetwork = (process.env.VITE_NETWORK || "testnet").toLowerCase()
const isMainnet = envNetwork === "mainnet" || envNetwork === "public"

const defaultRpcUrl = isMainnet
  ? "https://soroban-mainnet.stellar.org"
  : "https://soroban-testnet.stellar.org"
const defaultHorizonUrl = isMainnet
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org"

export const NETWORK_URLS = {
  rpcUrl: process.env.VITE_RPC_URL || defaultRpcUrl,
  horizonUrl: process.env.VITE_HORIZON_URL || defaultHorizonUrl,
}

const CHECK_TIMEOUT_MS = 5000

export interface DependencyStatus {
  status: "ok" | "degraded" | "down"
  detail: string
}

export async function checkUrl(baseUrl: string, path: string): Promise<DependencyStatus> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
    clearTimeout(timeout)
    return {
      status: response.ok ? "ok" : "degraded",
      detail: `${response.status} ${response.statusText}`,
    }
  } catch {
    clearTimeout(timeout)
    return {
      status: "down",
      detail: "Unreachable",
    }
  }
}
