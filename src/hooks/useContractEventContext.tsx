import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from "react"
import { useContractEvents, type ContractEvent } from "@/hooks/useContractEvents"

interface ContractEventContextValue {
  events: ContractEvent[]
  addListener: (callback: (event: ContractEvent) => void) => void
  removeListener: (callback: (event: ContractEvent) => void) => void
}

const ContractEventContext = createContext<ContractEventContextValue | null>(null)

export function ContractEventProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<ContractEvent[]>([])
  const listenersRef = useRef<Set<(event: ContractEvent) => void>>(new Set())

  const handleEvent = useCallback((event: ContractEvent) => {
    setEvents((prev) => [event, ...prev.slice(0, 99)])
    listenersRef.current.forEach((listener) => listener(event))
  }, [])

  useContractEvents({ onEvent: handleEvent })

  const addListener = useCallback((callback: (event: ContractEvent) => void) => {
    listenersRef.current.add(callback)
  }, [])

  const removeListener = useCallback((callback: (event: ContractEvent) => void) => {
    listenersRef.current.delete(callback)
  }, [])

  const value: ContractEventContextValue = {
    events,
    addListener,
    removeListener,
  }

  return <ContractEventContext.Provider value={value}>{children}</ContractEventContext.Provider>
}

export type { ContractEvent }

export function useContractEventContext(): ContractEventContextValue {
  const ctx = useContext(ContractEventContext)
  if (!ctx) throw new Error("useContractEventContext must be used within a ContractEventProvider")
  return ctx
}
