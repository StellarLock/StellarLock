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
const RPC_TIMEOUT = 3000 // 3 second timeout = slow

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

      const elapsed = Date.now() - start

      if (!response.ok) {
        return 'disconnected'
      }

      if (elapsed > RPC_TIMEOUT) {
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
