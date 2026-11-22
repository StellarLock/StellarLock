import { createContext, useContext } from "react"

export interface WalletContextValue {
  address: string | null
  isConnected: boolean
  connecting: boolean
  connectState: "idle" | "connecting" | "retrying" | "failed" | "success"
  connectError: string | null
  connectHelp: string | null
  disconnected: boolean
  networkChanged: boolean
  connect: () => Promise<void>
  disconnect: () => void
  dismissDisconnectAlert: () => void
  dismissNetworkAlert: () => void
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>
  /** Sign an arbitrary message (SEP-53) with the connected wallet; resolves to the base64 signature. */
  signMessage: (message: string) => Promise<string>
}

export const WalletContext = createContext<WalletContextValue | null>(null)

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider")
  return ctx
}
