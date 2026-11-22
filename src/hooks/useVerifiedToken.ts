import { useEffect, useState } from "react"
import { resolveNetworkKey } from "@/lib/network-key"

interface VerifiedEntry {
  address: string
  symbol: string
  name: string
}

interface VerifiedTokensFile {
  testnet: VerifiedEntry[]
  mainnet: VerifiedEntry[]
  pools?: {
    testnet?: string[]
    mainnet?: string[]
  }
}

// Per-network caches so switching network env never serves the wrong list.
const _caches = new Map<string, Set<string>>()
const _poolCaches = new Map<string, Set<string>>()

async function loadVerifiedTokensFile(): Promise<VerifiedTokensFile | null> {
  try {
    const res = await fetch("/verified-tokens.json")
    if (!res.ok) return null
    return (await res.json()) as VerifiedTokensFile
  } catch {
    return null
  }
}

async function loadVerifiedTokens(): Promise<Set<string>> {
  const key = resolveNetworkKey()
  const cached = _caches.get(key)
  if (cached) return cached

  const data = await loadVerifiedTokensFile()
  if (!data) return new Set()

  // Build a set for the current network. Fall back gracefully if the key
  // is somehow absent (e.g. an older deployed version of the JSON file).
  const entries: VerifiedEntry[] = data[key] ?? []
  const set = new Set(entries.map((t) => t.address.toLowerCase()))
  _caches.set(key, set)
  return set
}

async function loadVerifiedPools(): Promise<Set<string>> {
  const key = resolveNetworkKey()
  const cached = _poolCaches.get(key)
  if (cached) return cached

  const data = await loadVerifiedTokensFile()
  if (!data) return new Set()

  // Build a set of curated Aquarius/Soroswap pool addresses for the current
  // network. Fall back gracefully if the `pools` section is absent.
  const entries: string[] = data.pools?.[key] ?? []
  const set = new Set(entries.map((p) => p.toLowerCase()))
  _poolCaches.set(key, set)
  return set
}

export function useVerifiedToken(contractId?: string): boolean | null {
  const [verified, setVerified] = useState<boolean | null>(null)

  useEffect(() => {
    if (!contractId) {
      setVerified(null)
      return
    }
    void loadVerifiedTokens().then((set) => setVerified(set.has(contractId.toLowerCase())))
  }, [contractId])

  return verified
}

export function useVerifiedPool(poolShareAddress?: string): boolean | null {
  const [verified, setVerified] = useState<boolean | null>(null)

  useEffect(() => {
    if (!poolShareAddress) {
      setVerified(null)
      return
    }
    setVerified(null)
    void loadVerifiedPools().then((set) =>
      setVerified(set.has(poolShareAddress.toLowerCase())),
    )
  }, [poolShareAddress])

  return verified
}