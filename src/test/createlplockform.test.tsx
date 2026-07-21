import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { CreateLpLockForm } from "../components/locks/CreateLpLockForm"
import { VALID_PUBLIC_KEY, VALID_CONTRACT_ADDRESS } from "./mocks"

vi.mock("@stellar/stellar-sdk", () => ({
  Address: class {
    toScVal = vi.fn()
  },
  nativeToScVal: vi.fn(),
  xdr: { ScVal: { scvVoid: vi.fn() } },
}))

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
  CONTRACTS: { lpLocker: "LP_LOCKER_ADDR" },
  isValidStellarContractAddress: (addr: string) => addr.startsWith("C") && addr.length === 56,
  isValidStellarPublicKey: (addr: string) => addr.startsWith("G") && addr.length === 56,
}))

describe("CreateLpLockForm Validation Requirements", () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({
      address: VALID_PUBLIC_KEY,
      signTransaction: vi.fn(),
    })
    mockUseTokenBalance.mockReturnValue({ data: 100, loading: false })
    mockUseTokenAllowance.mockReturnValue({ data: 0, loading: false })
  })

  it("should enable submission exclusively when all Stellar contract paths and amounts match parameters", async () => {
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    const submitBtn = screen.getByRole("button", { name: /lock liquidity/i })
    expect(submitBtn).toBeDisabled()

    // 1. Enter valid Pool Contract Address
    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    expect(submitBtn).toBeDisabled()

    // 2. Enter Token A Contract Address
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    expect(submitBtn).toBeDisabled()

    // 3. Enter Token B Contract Address
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    expect(submitBtn).toBeDisabled()

    // 4. Enter Valid Number Amount
    await user.type(screen.getByLabelText(/amount/i), "15")
    expect(submitBtn).toBeDisabled()

    // 5. Select Valid Tomorrow Date String
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 2)
    const dateInputStr = tomorrow.toISOString().slice(0, 10)

    await user.type(screen.getByLabelText(/unlock date/i), dateInputStr)

    // Form switches valid flag to true, freeing the button element interaction parameters
    expect(submitBtn).toBeEnabled()
  })
})
