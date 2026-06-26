import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef, type ReactNode } from "react"
import { isConnected, requestAccess, getAddress, signTransaction as freighterSignTx } from "@stellar/freighter-api"
import { trackEvent } from "@/lib/analytics"
import { notify } from "../lib/utils"

const STORAGE_KEY = "stellarlock:wallet"
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
const CONNECTION_CHECK_INTERVAL = 10_000

interface WalletContextValue {
  address: string | null
  isConnected: boolean
  connecting: boolean
  disconnected: boolean
  networkChanged: boolean
  connect: () => Promise<void>
  disconnect: () => void
  dismissDisconnectAlert: () => void
  dismissNetworkAlert: () => void
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string }>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [networkChanged, setNetworkChanged] = useState(false)
  const connectionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const previousNetworkRef = useRef<string | null>(null)

  // Restore persisted session and verify it's still accessible
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    isConnected()
      .then((res) => {
        if (res.isConnected) {
          setAddress(saved)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
  }, [])

  // Poll wallet connection status every 10 seconds
  useEffect(() => {
    if (!address) return

    const checkConnection = async () => {
      try {
        // Check if freighter extension is still available
        if (typeof window !== "undefined" && !window.freighter) {
          setDisconnected(true)
          setAddress(null)
          localStorage.removeItem(STORAGE_KEY)
          return
        }

        const connected = await isConnected()
        if (!connected.isConnected) {
          setDisconnected(true)
          setAddress(null)
          localStorage.removeItem(STORAGE_KEY)
          return
        }

        // Check for network changes
        const currentNetwork = connected.network?.passphrase || "unknown"
        if (previousNetworkRef.current && previousNetworkRef.current !== currentNetwork) {
          setNetworkChanged(true)
          setAddress(null)
          localStorage.removeItem(STORAGE_KEY)
          return
        }
        previousNetworkRef.current = currentNetwork

        // Verify address is still accessible
        const addrResult = await getAddress()
        if (addrResult.error) {
          setDisconnected(true)
          setAddress(null)
          localStorage.removeItem(STORAGE_KEY)
        }
      } catch (err) {
        console.error("[wallet connection check error]", err)
      }
    }

    connectionCheckIntervalRef.current = setInterval(checkConnection, CONNECTION_CHECK_INTERVAL)
    return () => {
      if (connectionCheckIntervalRef.current) {
        clearInterval(connectionCheckIntervalRef.current)
      }
    }
  }, [address])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const connected = await isConnected()
      if (!connected.isConnected) {
        notify.error("Freighter extension not found. Please install it from freighter.app")
        return
      }
      // requestAccess opens the Freighter popup for the user to approve
      const accessResult = await requestAccess()
      if (accessResult.error) {
        throw new Error(accessResult.error)
      }
      const addrResult = await getAddress()
      if (addrResult.error) {
        throw new Error(addrResult.error)
      }
      setAddress(addrResult.address)
      localStorage.setItem(STORAGE_KEY, addrResult.address)
      trackEvent("wallet_connect")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("Wallet connect error:", msg)
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    setDisconnected(false)
    setNetworkChanged(false)
    localStorage.removeItem(STORAGE_KEY)
    if (connectionCheckIntervalRef.current) {
      clearInterval(connectionCheckIntervalRef.current)
      connectionCheckIntervalRef.current = null
    }
    trackEvent("wallet_disconnect")
  }, [])

  const dismissDisconnectAlert = useCallback(() => {
    setDisconnected(false)
  }, [])

  const dismissNetworkAlert = useCallback(() => {
    setNetworkChanged(false)
  }, [])

  const signTransaction = useCallback(
    async (xdr: string): Promise<{ signedTxXdr: string }> => {
      if (!address) throw new Error("Wallet not connected")
      const result = await freighterSignTx(xdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      })
      if (import.meta.env.DEV) console.log("[signTransaction result]", result)
      if (result.error) {
        const errMsg =
          typeof result.error === "string"
            ? result.error
            : ((result.error as { message?: string }).message ?? JSON.stringify(result.error))
        throw new Error(errMsg)
      }
      if (!result.signedTxXdr) throw new Error("Freighter returned empty transaction — did you approve it?")
      return { signedTxXdr: result.signedTxXdr }
    },
    [address],
  )

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      isConnected: !!address,
      connecting,
      disconnected,
      networkChanged,
      connect,
      disconnect,
      dismissDisconnectAlert,
      dismissNetworkAlert,
      signTransaction,
    }),
    [address, connecting, disconnected, networkChanged, connect, disconnect, dismissDisconnectAlert, dismissNetworkAlert, signTransaction],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider")
  return ctx
}
