import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef, type ReactNode } from "react"
import { getAddress, getNetwork, isConnected, requestAccess, signTransaction as freighterSignTx } from "@stellar/freighter-api"
import { trackEvent } from "@/lib/analytics"
import { NETWORK } from "@/lib/stellar"
import { notify } from "../lib/utils"

const STORAGE_KEY = "stellarlock:wallet"
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
  const [walletNetwork, setWalletNetwork] = useState<string | null>(null)
  const connectionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const previousNetworkRef = useRef<string | null>(null)

  // Restore persisted session and verify it's still accessible
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    isConnected()
      .then(async (res) => {
        if (!res.isConnected) {
          localStorage.removeItem(STORAGE_KEY)
          return
        }

        const networkResult = await getNetwork()
        const walletNetwork = networkResult.error ? null : networkResult.networkPassphrase || null

        if (walletNetwork && walletNetwork !== NETWORK.passphrase) {
          setNetworkChanged(true)
          localStorage.removeItem(STORAGE_KEY)
          return
        }

        previousNetworkRef.current = walletNetwork
        setWalletNetwork(walletNetwork)
        setAddress(saved)
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
  }, [])

  // Poll wallet connection status every 10 seconds
  useEffect(() => {
    if (!address) return

    const checkConnection = async () => {
      try {
        // Check if freighter extension is still available
        const win = window as Window & { freighter?: unknown }
        if (typeof window !== "undefined" && !win.freighter) {
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

        const currentNetworkResult = await getNetwork()
        const currentNetwork = currentNetworkResult.error ? "unknown" : currentNetworkResult.networkPassphrase || "unknown"
        setWalletNetwork(currentNetwork)

        if (currentNetwork !== NETWORK.passphrase) {
          setNetworkChanged(true)
          setAddress(null)
          localStorage.removeItem(STORAGE_KEY)
          return
        }

        // Check for network changes
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

      const networkResult = await getNetwork()
      if (networkResult.error) {
        throw new Error(networkResult.error)
      }
      const walletNetwork = networkResult.networkPassphrase || null
      setWalletNetwork(walletNetwork)
      if (walletNetwork && walletNetwork !== NETWORK.passphrase) {
        setNetworkChanged(true)
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
        networkPassphrase: NETWORK.passphrase,
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
