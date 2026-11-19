/**
 * Unit tests for useWallet's periodic connection-health poll — #693
 *
 * Once connected, WalletProvider calls kit.getAddress() every 10s. If the
 * address disappears, changes, or the call throws, it must flag
 * `disconnected`, clear the address and wipe the persisted session so the
 * UI stops treating the wallet as connected.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { Networks } from "@stellar/stellar-sdk"
import type { ReactNode } from "react"

const getAddressMock = vi.fn()
const getNetworkMock = vi.fn()

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: vi.fn().mockImplementation(() => ({
    getAddress: getAddressMock,
    getNetwork: getNetworkMock,
    setWallet: vi.fn(),
    openModal: vi.fn(),
    signTransaction: vi.fn(),
  })),
  WalletNetwork: { PUBLIC: "PUBLIC", TESTNET: "TESTNET" },
  allowAllModules: vi.fn(() => []),
}))

import { WalletProvider } from "@/hooks/WalletProvider"
import { useWallet } from "@/hooks/useWallet"

const WALLET_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
const OTHER_ADDRESS = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const STORAGE_KEY = "stellarlock:wallet"
const WALLET_ID_KEY = "stellarlock:wallet-id"
const CONNECTION_CHECK_INTERVAL = 10_000

function wrapper({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

// Mount with a persisted session and let the restore-on-mount check resolve.
async function renderConnected() {
  const hook = renderHook(() => useWallet(), { wrapper })
  await advance(0)
  expect(hook.result.current.address).toBe(WALLET_ADDRESS)
  expect(hook.result.current.isConnected).toBe(true)
  expect(hook.result.current.disconnected).toBe(false)
  return hook
}

function expectAutoDisconnected(current: ReturnType<typeof useWallet>) {
  expect(current.disconnected).toBe(true)
  expect(current.address).toBeNull()
  expect(current.isConnected).toBe(false)
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  expect(localStorage.getItem(WALLET_ID_KEY)).toBeNull()
}

describe("useWallet — connection-health poll (#693)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    getAddressMock.mockReset()
    getNetworkMock.mockReset()
    getAddressMock.mockResolvedValue({ address: WALLET_ADDRESS })
    getNetworkMock.mockResolvedValue({ network: "TESTNET", networkPassphrase: Networks.TESTNET })
    localStorage.setItem(STORAGE_KEY, WALLET_ADDRESS)
    localStorage.setItem(WALLET_ID_KEY, "freighter")
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it("stays connected while getAddress() keeps returning the same address", async () => {
    const { result } = await renderConnected()

    await advance(CONNECTION_CHECK_INTERVAL * 2)

    expect(result.current.disconnected).toBe(false)
    expect(result.current.address).toBe(WALLET_ADDRESS)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(WALLET_ADDRESS)
    expect(localStorage.getItem(WALLET_ID_KEY)).toBe("freighter")
  })

  it("does not disconnect before the interval elapses", async () => {
    const { result } = await renderConnected()
    getAddressMock.mockResolvedValue({ address: null })

    await advance(CONNECTION_CHECK_INTERVAL - 1)

    expect(result.current.disconnected).toBe(false)
    expect(result.current.address).toBe(WALLET_ADDRESS)
  })

  it("auto-disconnects when getAddress() returns an empty address", async () => {
    const { result } = await renderConnected()
    getAddressMock.mockResolvedValue({ address: "" })

    await advance(CONNECTION_CHECK_INTERVAL)

    expectAutoDisconnected(result.current)
  })

  it("auto-disconnects when getAddress() returns a different address", async () => {
    const { result } = await renderConnected()
    getAddressMock.mockResolvedValue({ address: OTHER_ADDRESS })

    await advance(CONNECTION_CHECK_INTERVAL)

    expectAutoDisconnected(result.current)
  })

  it("auto-disconnects when getAddress() throws", async () => {
    const { result } = await renderConnected()
    getAddressMock.mockRejectedValue(new Error("wallet locked"))

    await advance(CONNECTION_CHECK_INTERVAL)

    expectAutoDisconnected(result.current)
  })

  it("stops polling after the auto-disconnect", async () => {
    const { result } = await renderConnected()
    getAddressMock.mockResolvedValue({ address: null })

    await advance(CONNECTION_CHECK_INTERVAL)
    expectAutoDisconnected(result.current)

    const callsAfterDisconnect = getAddressMock.mock.calls.length
    await advance(CONNECTION_CHECK_INTERVAL * 3)
    expect(getAddressMock).toHaveBeenCalledTimes(callsAfterDisconnect)
  })

  it("dismissDisconnectAlert() clears the disconnected flag", async () => {
    const { result } = await renderConnected()
    getAddressMock.mockResolvedValue({ address: null })

    await advance(CONNECTION_CHECK_INTERVAL)
    expect(result.current.disconnected).toBe(true)

    act(() => {
      result.current.dismissDisconnectAlert()
    })

    expect(result.current.disconnected).toBe(false)
  })
})
