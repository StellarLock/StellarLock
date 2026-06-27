import { useEffect, useState } from "react"

interface VerifiedEntry {
  address: string
  symbol: string
  name: string
}

let _cache: Set<string> | null = null

async function loadVerifiedTokens(): Promise<Set<string>> {
  if (_cache) return _cache
  try {
    const res = await fetch("/verified-tokens.json")
    if (!res.ok) return new Set()
    const data: { tokens: VerifiedEntry[] } = await res.json()
    _cache = new Set(data.tokens.map((t) => t.address.toLowerCase()))
    return _cache
  } catch {
    return new Set()
  }
}

export function useVerifiedToken(contractId?: string): boolean | null {
  const [verified, setVerified] = useState<boolean | null>(null)

  useEffect(() => {
    if (!contractId) {
      setVerified(null)
      return
    }
    loadVerifiedTokens().then((set) => setVerified(set.has(contractId.toLowerCase())))
  }, [contractId])

  return verified
}
