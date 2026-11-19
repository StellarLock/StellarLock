import { createContext, useContext } from "react"
import type { ContractEvent } from "@/hooks/useContractEvents"

export interface ContractEventContextValue {
  events: ContractEvent[]
  addListener: (callback: (event: ContractEvent) => void) => void
  removeListener: (callback: (event: ContractEvent) => void) => void
}

export const ContractEventContext = createContext<ContractEventContextValue | null>(null)

export type { ContractEvent }

export function useContractEventContext(): ContractEventContextValue {
  const ctx = useContext(ContractEventContext)
  if (!ctx) throw new Error("useContractEventContext must be used within a ContractEventProvider")
  return ctx
}
