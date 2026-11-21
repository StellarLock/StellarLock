import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, fireEvent, waitFor } from "@testing-library/react"
import { scValToNative } from "@stellar/stellar-sdk"
import { render } from "./utils"
import { CreateTokenLockForm } from "@/components/locks/CreateTokenLockForm"
import { CreateLpLockForm } from "@/components/locks/CreateLpLockForm"
import { VALID_CONTRACT_ADDRESS, VALID_CONTRACT_ADDRESS_B, VALID_PUBLIC_KEY } from "./mocks"

const { mockGetOnChainTokenMeta, mockUseTokenBalanceSWR, mockUseTokenBalance, mockEstimateLockCost } = vi.hoisted(
  () => ({
    mockGetOnChainTokenMeta: vi.fn(),
    mockUseTokenBalanceSWR: vi.fn(),
    mockUseTokenBalance: vi.fn(),
    mockEstimateLockCost: vi.fn(),
  }),
)

vi.mock("@/lib/token-metadata", () => ({
  getOnChainTokenMeta: (...args: unknown[]) =>
    mockGetOnChainTokenMeta(...args) as Promise<{ symbol: string; name: string; decimals: number }>,
}))

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    address: VALID_PUBLIC_KEY,
    signTransaction: vi.fn(),
  }),
}))

vi.mock("@/hooks/WalletProvider", () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/hooks/useTokenBalanceSWR", () => ({
  useTokenBalanceSWR: () =>
    mockUseTokenBalanceSWR() as {
      balance: bigint | null
      isLoading: boolean
      isRevalidating: boolean
      refetch: () => void
      clear: () => void
    },
}))

vi.mock("@/hooks/useLocks", () => ({
  useTokenBalance: () => mockUseTokenBalance() as { data: number | null; loading: boolean },
}))

vi.mock("@/hooks/useDraftStorage", () => ({
  useDraftAutoSave: vi.fn(),
}))

vi.mock("@/hooks/useNotifications", () => ({
  addNotification: vi.fn(),
}))

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>()
  return {
    ...actual,
    estimateLockCost: (...args: unknown[]) =>
      mockEstimateLockCost(...args) as Promise<{ networkFee: number; resourceFee: number; total: number }>,
  }
})

describe("Non-7-decimal form balance and cost-estimate encoding (#1059, #1061)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEstimateLockCost.mockResolvedValue({ networkFee: 0.01, resourceFee: 0.01, total: 0.02 })
    mockUseTokenBalance.mockReturnValue({ data: 100, loading: false })
  })

  it("scales CreateTokenLockForm balance display and simulation args using token decimals", async () => {
    mockGetOnChainTokenMeta.mockResolvedValue({ symbol: "USDC", name: "USD Coin", decimals: 6 })
    mockUseTokenBalanceSWR.mockReturnValue({
      balance: 1_500_000n,
      isLoading: false,
      isRevalidating: false,
      refetch: vi.fn(),
      clear: vi.fn(),
    })

    render(<CreateTokenLockForm />)

    fireEvent.change(screen.getByLabelText(/token contract address/i), {
      target: { value: VALID_CONTRACT_ADDRESS },
    })

    await waitFor(() => {
      expect(screen.getByText(/1\.5/)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/amount to lock/i), { target: { value: "1.5" } })
    const futureDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    fireEvent.change(screen.getByLabelText(/^unlock date$/i), { target: { value: futureDate } })

    await waitFor(
      () => {
        expect(mockEstimateLockCost).toHaveBeenCalled()
      },
      { timeout: 1500 },
    )

    const [, method, simArgs] = mockEstimateLockCost.mock.calls.at(-1) as [
      string,
      string,
      Parameters<typeof scValToNative>[0][],
    ]
    expect(method).toBe("create_lock")
    expect(scValToNative(simArgs[2])).toBe(1_500_000n)
  })

  it("encodes CreateLpLockForm simulation args using pool share token decimals", async () => {
    mockGetOnChainTokenMeta.mockResolvedValue({ symbol: "LP", name: "Pool Share", decimals: 18 })
    mockUseTokenBalanceSWR.mockReturnValue({
      balance: null,
      isLoading: false,
      isRevalidating: false,
      refetch: vi.fn(),
      clear: vi.fn(),
    })

    render(<CreateLpLockForm />)

    fireEvent.change(screen.getByLabelText(/pool share token address/i), {
      target: { value: VALID_CONTRACT_ADDRESS },
    })
    fireEvent.change(screen.getByLabelText(/token a address/i), {
      target: { value: VALID_CONTRACT_ADDRESS },
    })
    fireEvent.change(screen.getByLabelText(/token b address/i), {
      target: { value: VALID_CONTRACT_ADDRESS_B },
    })
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "0.1" } })
    const futureDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    fireEvent.change(screen.getByLabelText(/unlock date/i), { target: { value: futureDate } })

    await waitFor(
      () => {
        expect(mockEstimateLockCost).toHaveBeenCalled()
      },
      { timeout: 1500 },
    )

    const [, , simArgs] = mockEstimateLockCost.mock.calls.at(-1) as [
      string,
      string,
      Parameters<typeof scValToNative>[0][],
    ]
    expect(scValToNative(simArgs[5])).toBe(100_000_000_000_000_000n)
  })
})
