import { simulateCall } from "@/lib/stellar"

export interface TokenMetadata {
  symbol: string
  name?: string
  logo?: string
  issuer?: string
  domain?: string
  verified?: boolean
}

export interface OnChainTokenMeta {
  symbol: string
  name: string
  decimals: number
}

interface CachedMetadata extends TokenMetadata {
  cached_at: number
}

const CACHE_KEY = "stellarlock:token_metadata"
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

// In-memory cache for on-chain SEP-41 metadata (symbol/name/decimals)
const onChainCache = new Map<string, OnChainTokenMeta>()

function getCache(): Record<string, CachedMetadata> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}")
  } catch {
    return {}
  }
}

function saveCache(cache: Record<string, CachedMetadata>) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
}

function isCacheValid(cached: CachedMetadata): boolean {
  return Date.now() - cached.cached_at < CACHE_TTL
}

async function fetchFromStellarExpert(contractId: string): Promise<TokenMetadata | null> {
  try {
    const res = await fetch(`https://api.stellarexpert.com/api/v2/asset/contracts/${contractId}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      symbol: data.code || "",
      name: data.name,
      logo: data.logo,
      issuer: data.issuer,
      domain: data.domain,
      verified: data.verified,
    }
  } catch {
    return null
  }
}

async function fetchFromStellarToml(domain: string): Promise<TokenMetadata | null> {
  try {
    const res = await fetch(`https://${domain}/.well-known/stellar.toml`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const text = await res.text()
    // Simple parsing for logo and name - in production, use proper TOML parser
    const logoMatch = text.match(/image\s*=\s*"([^"]+)"/)
    const nameMatch = text.match(/name\s*=\s*"([^"]+)"/)
    return {
      symbol: "",
      name: nameMatch?.[1],
      logo: logoMatch?.[1],
      domain,
    }
  } catch {
    return null
  }
}

export async function getTokenMetadata(contractId: string): Promise<TokenMetadata> {
  const cache = getCache()
  const cached = cache[contractId]

  // Return cached if valid
  if (cached && isCacheValid(cached)) {
    const { cached_at, ...metadata } = cached
    return metadata
  }

  // Try multiple sources
  let metadata: TokenMetadata | null = null

  // 1. Try StellarExpert first
  metadata = await fetchFromStellarExpert(contractId)

  // 2. If we have a domain, try Stellar.toml
  if (!metadata?.logo && metadata?.domain) {
    const tomlData = await fetchFromStellarToml(metadata.domain)
    if (tomlData?.logo) {
      metadata = { ...metadata, ...tomlData }
    }
  }

  // 3. Fallback if no logo found
  if (!metadata) {
    metadata = { symbol: "" }
  }

  // Cache the result
  const toCache: CachedMetadata = {
    ...metadata,
    cached_at: Date.now(),
  }
  cache[contractId] = toCache
  saveCache(cache)

  return metadata
}

/**
 * Fetch SEP-41 token metadata (symbol, name, decimals) directly from the
 * token contract. Results are cached in memory for the lifetime of the page.
 * Falls back to a truncated contract address / 7 decimals on RPC failure.
 */
export async function getOnChainTokenMeta(contractId: string): Promise<OnChainTokenMeta> {
  if (onChainCache.has(contractId)) return onChainCache.get(contractId)!

  const [symbolResult, nameResult, decimalsResult] = await Promise.allSettled([
    simulateCall<string>(contractId, "symbol", []),
    simulateCall<string>(contractId, "name", []),
    simulateCall<number>(contractId, "decimals", []),
  ])

  const meta: OnChainTokenMeta = {
    symbol:
      symbolResult.status === "fulfilled" && symbolResult.value
        ? symbolResult.value
        : contractId.slice(0, 6),
    name:
      nameResult.status === "fulfilled" && nameResult.value
        ? nameResult.value
        : contractId.slice(0, 6),
    decimals:
      decimalsResult.status === "fulfilled" && decimalsResult.value != null
        ? Number(decimalsResult.value)
        : 7,
  }

  onChainCache.set(contractId, meta)
  return meta
}

export function clearTokenMetadataCache() {
  localStorage.removeItem(CACHE_KEY)
}
