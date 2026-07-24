import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { CreateTokenLockForm } from "../components/locks/CreateTokenLockForm"
import { VALID_PUBLIC_KEY, VALID_CONTRACT_ADDRESS } from "./mocks"

// Complete third-party dependency overrides
vi.mock("@stellar/stellar-sdk", () => ({
  Address: class {
    toScVal = vi.fn()
  },
  nativeToScVal: vi.fn(),
  xdr: { ScVal: { scvVoid: vi.fn() } },
}))

// Hook mocks with TypeScript ESLint 'any' bypasses
const mockUseWallet = vi.fn()
vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockUseWallet() as unknown as Record<string, unknown>,
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

const mockUseTokenBalance = vi.fn()
const mockUseTokenAllowance = vi.fn()
vi.mock("@/hooks/useLocks", () => ({
  useTokenBalance: () => mockUseTokenBalance() as unknown as Record<string, unknown>,
  useTokenAllowance: () => mockUseTokenAllowance() as unknown as Record<string, unknown>,
}))

vi.mock("@/lib/stellar", () => ({
  CONTRACTS: { tokenLocker: "CONTRACT_LOCKER" },
  isValidStellarAddress: (addr: string) => addr.startsWith("G") && addr.length === 56,
  isValidStellarContractAddress: (addr: string) => addr.startsWith("C") && addr.length === 56,
}))

describe("CreateTokenLockForm Validation Rules", () => {
  beforeEach(() => {
    localStorage.clear()
    mockUseWallet.mockReturnValue({ address: VALID_PUBLIC_KEY })
    mockUseTokenBalance.mockReturnValue({ data: 500, loading: false })
    mockUseTokenAllowance.mockReturnValue({ data: 0, loading: false })
  })

  it("should evaluate the form state changes synchronously as valid strings are provided", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    expect(submitButton).toBeDisabled()

    // 1. Type Valid Contract Token Address
    await user.type(screen.getByLabelText(/token contract address/i), VALID_CONTRACT_ADDRESS)
    expect(submitButton).toBeDisabled()

    // 2. Type Valid Positive Numerical Amount
    await user.type(screen.getByLabelText(/amount/i), "250")
    expect(submitButton).toBeDisabled()

    // 3. Type Future Date Target
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 2)
    const validDateString = tomorrow.toISOString().slice(0, 10)

    await user.type(screen.getByLabelText(/unlock date/i), validDateString)

    // Form evaluates all rules on state loop changes and flips open the button element
    expect(submitButton).toBeEnabled()
  })
})
