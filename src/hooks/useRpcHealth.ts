import { useEffect, useState } from 'react'

export type RpcStatus = 'connected' | 'slow' | 'disconnected'

export interface RpcHealthState {
  status: RpcStatus
  lastChecked: Date | null
}

const RPC_ENDPOINTS = [
  'https://soroban-testnet.stellar.org',
  'https://horizon-testnet.stellar.org',
]

const HEALTH_CHECK_INTERVAL = 30000 // 30 seconds
const RPC_TIMEOUT = 3000 // hard timeout — treat as disconnected if exceeded
const SLOW_THRESHOLD = 1500 // flag as slow if response takes longer than this

async function checkRpcHealth(): Promise<RpcStatus> {
  try {
    for (const endpoint of RPC_ENDPOINTS) {
      const start = Date.now()
      const response = await Promise.race([
        fetch(`${endpoint}/health`, { method: 'HEAD' }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), RPC_TIMEOUT)
        ),
      ])

      // If we reach here the request completed before RPC_TIMEOUT,
      // so elapsed is always < RPC_TIMEOUT. Check against SLOW_THRESHOLD instead.
      const elapsed = Date.now() - start

      if (!response.ok) {
        return 'disconnected'
      }

      if (elapsed > SLOW_THRESHOLD) {
        return 'slow'
      }
    }

    return 'connected'
  } catch {
    return 'disconnected'
  }
}

export function useRpcHealth() {
  const [state, setState] = useState<RpcHealthState>({
    status: 'connected',
    lastChecked: null,
  })

  useEffect(() => {
    let isMounted = true

    const check = async () => {
      const status = await checkRpcHealth()
      if (isMounted) {
        setState({ status, lastChecked: new Date() })
      }
    }

    // Check immediately on mount
    void check()

    // Then check every 30 seconds
    const intervalId = setInterval(() => void check(), HEALTH_CHECK_INTERVAL)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [])

  return state
}
