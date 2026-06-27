import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef, type ReactNode } from "react"
import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
} from "@creit.tech/stellar-wallets-kit"
import { trackEvent } from "@/lib/analytics"
import { NETWORK } from "@/lib/stellar"
import { notify } from "../lib/utils"

const STORAGE_KEY = "stellarlock:wallet"
const WALLET_ID_KEY = "stellarlock:wallet-id"
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

const walletNetwork = NETWORK.id === "mainnet" ? WalletNetwork.PUBLIC : WalletNetwork.TESTNET

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [networkChanged, setNetworkChanged] = useState(false)
  const connectionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const kitRef = useRef<StellarWalletsKit | null>(null)

  function getKit(): StellarWalletsKit {
    if (!kitRef.current) {
      const savedWalletId = localStorage.getItem(WALLET_ID_KEY) ?? ""
      kitRef.current = new StellarWalletsKit({
        network: walletNetwork,
        selectedWalletId: savedWalletId,
        modules: allowAllModules(),
      })
    }
    return kitRef.current
  }

  // Restore persisted session and verify it's still accessible
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    const savedWalletId = localStorage.getItem(WALLET_ID_KEY)
    if (!saved || !savedWalletId) return
    const k = getKit()
    k.setWallet(savedWalletId)
    k.getPublicKey()
      .then((publicKey) => {
        if (publicKey && publicKey === saved) {
          setAddress(saved)
        } else {
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem(WALLET_ID_KEY)
        }
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(WALLET_ID_KEY)
      })
  }, [])

  // Poll wallet connection status every 10 seconds
  useEffect(() => {
    if (!address) return

    const checkConnection = async () => {
      try {
        const k = getKit()
        const publicKey = await k.getPublicKey()
        if (!publicKey || publicKey !== address) {
          setDisconnected(true)
          setAddress(null)
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem(WALLET_ID_KEY)
        }
      } catch {
        setDisconnected(true)
        setAddress(null)
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(WALLET_ID_KEY)
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
      const k = getKit()
      await new Promise<void>((resolve, reject) => {
        k.openModal({
          onWalletSelected: async (option) => {
            try {
              k.setWallet(option.id)
              const publicKey = await k.getPublicKey()
              if (!publicKey) {
                reject(new Error("Wallet returned no public key"))
                return
              }
              setAddress(publicKey)
              localStorage.setItem(STORAGE_KEY, publicKey)
              localStorage.setItem(WALLET_ID_KEY, option.id)
              trackEvent("wallet_connect")
              resolve()
            } catch (err) {
              reject(err)
            }
          },
          onClosed: () => resolve(),
        })
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("Wallet connect error:", msg)
      notify.error(msg)
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    setDisconnected(false)
    setNetworkChanged(false)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(WALLET_ID_KEY)
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
      const k = getKit()
      const result = await k.signTransaction(xdr, {
        networkPassphrase: NETWORK.passphrase,
        address,
      })
      if (!result.signedTxXdr) throw new Error("Wallet returned empty transaction — did you approve it?")
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
