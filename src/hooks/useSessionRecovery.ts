import { useEffect, useCallback } from "react"
import { useWallet } from "@/hooks/useWallet"
import { createLogger } from "@/lib/logger"

const log = createLogger("useSessionRecovery")

export function useSessionRecovery() {
  const { isConnected } = useWallet()

  const refetchData = useCallback(async () => {
    if (!isConnected) return

    try {
      // Trigger any necessary data refresh
      window.dispatchEvent(new CustomEvent("wallet:reconnected"))
    } catch (err) {
      log.error("[session recovery error]", err)
    }
  }, [isConnected])

  useEffect(() => {
    if (isConnected) {
      refetchData()
    }
  }, [isConnected, refetchData])
}
