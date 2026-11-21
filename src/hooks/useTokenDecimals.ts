import { useEffect, useState } from "react"
import { getOnChainTokenMeta } from "@/lib/token-metadata"

const DEFAULT_TOKEN_DECIMALS = 7

/**
 * Resolve on-chain SEP-41 token decimals for a valid contract address,
 * defaulting to 7 while loading or when metadata lookup fails.
 */
export function useTokenDecimals(tokenAddress: string | undefined): number {
  const [resolved, setResolved] = useState<{ address: string; decimals: number } | null>(null)

  useEffect(() => {
    if (!tokenAddress) return
    let cancelled = false
    try {
      Promise.resolve(getOnChainTokenMeta(tokenAddress))
        .then((meta) => {
          if (!cancelled && Number.isInteger(meta?.decimals) && meta.decimals >= 0) {
            setResolved({ address: tokenAddress, decimals: meta.decimals })
          }
        })
        .catch(() => {
          // Fall back to default decimals when RPC metadata lookup is unavailable
        })
    } catch {
      // Guard mocked test environments where simulateCall is omitted
    }
    return () => {
      cancelled = true
    }
  }, [tokenAddress])

  if (!tokenAddress) return DEFAULT_TOKEN_DECIMALS
  return resolved?.address === tokenAddress ? resolved.decimals : DEFAULT_TOKEN_DECIMALS
}
