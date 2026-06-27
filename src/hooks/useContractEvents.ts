import { useEffect, useRef, useCallback, useState } from "react"
import { NETWORK } from "@/lib/stellar"

export interface ContractEvent {
  type: "lock_created" | "lock_withdrawn" | "lock_extended" | "beneficiary_transferred" | "lp_lock_created" | "lp_lock_withdrawn" | "lp_lock_extended" | "lp_beneficiary_transferred"
  lockId: string
  timestamp: number
  data: Record<string, unknown>
}

interface EventPollingOptions {
  contractAddress?: string
  onEvent?: (event: ContractEvent) => void
  pollInterval?: number
}

const EVENT_POLL_INTERVAL = 3000

export function useContractEvents(options: EventPollingOptions = {}) {
  const { onEvent, pollInterval = EVENT_POLL_INTERVAL } = options
  const [events, setEvents] = useState<ContractEvent[]>([])
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastSequenceRef = useRef<number>(0)

  const fetchEvents = useCallback(async () => {
    try {
      const rpc = import.meta.env.VITE_RPC_URL || NETWORK.rpcUrl

      const response = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getEvents",
          params: {
            startLedger: Math.max(1, lastSequenceRef.current - 1000),
            filters: [
              {
                type: "contract",
                contractIds: [],
              },
            ],
          },
        }),
      })

      if (!response.ok) {
        console.error("[getEvents error]", response.status)
        return
      }

      const data = await response.json()
      if (data.error) {
        console.error("[getEvents error]", data.error)
        return
      }

      const responseEvents = data.result?.events || []
      for (const event of responseEvents) {
        if (!event.topic || event.topic.length < 1) continue

        const eventType = event.topic[0]
        if (
          !eventType?.includes("lock_created") &&
          !eventType?.includes("lock_withdrawn") &&
          !eventType?.includes("lock_extended") &&
          !eventType?.includes("beneficiary_transferred")
        ) {
          continue
        }

        const contractEvent: ContractEvent = {
          type: eventType as ContractEvent["type"],
          lockId: event.topic[1] || String(event.id),
          timestamp: event.ledgerClosedAt ? new Date(event.ledgerClosedAt).getTime() : Date.now(),
          data: {
            raw: event,
          },
        }

        setEvents((prev) => [contractEvent, ...prev.slice(0, 99)])
        if (onEvent) {
          onEvent(contractEvent)
        }

        lastSequenceRef.current = Math.max(lastSequenceRef.current, event.ledger || 0)
      }
    } catch (err) {
      console.error("[contract events polling error]", err)
    }
  }, [onEvent])

  useEffect(() => {
    fetchEvents()
    pollIntervalRef.current = setInterval(fetchEvents, pollInterval)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [fetchEvents, pollInterval])

  return { events }
}
