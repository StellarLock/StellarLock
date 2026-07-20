import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { CreateTokenLockForm } from "@/components/locks/CreateTokenLockForm"
import { mockWallet, VALID_CONTRACT_ADDRESS, VALID_PUBLIC_KEY } from "./mocks"
import { useTokenAllowance, useTokenBalance } from "@/hooks/useLocks"

// Mock the wallet context
vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

// Mock the API calls
vi.mock("@/lib/token-locker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/token-locker")>()
  return {
    ...actual,
    createTokenLock: vi.fn().mockResolvedValue({ id: "1", txHash: "abc" }),
  }
})

vi.mock("@/lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar")>()
  return {
    ...actual,
    submitTokenApproval: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@/hooks/useLocks", () => ({
  useTokenBalance: vi.fn(() => ({
    data: 5000,
    loading: false,
    error: null,
    reload: vi.fn(),
  })),
  useTokenAllowance: vi.fn(() => ({
    data: 10000,
    loading: false,
    error: null,
    reload: vi.fn(),
  })),
}))

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}))

describe("Token Lock Creation Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should render the token lock form with all fields", () => {
    render(<CreateTokenLockForm />)

    expect(screen.getByLabelText(/token contract address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/beneficiary/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/unlock date/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /lock tokens/i })).toBeInTheDocument()
  })

  it("should validate form inputs before submission", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    expect(submitButton).toBeDisabled()

    // Fill token address
    const tokenInput = screen.getByPlaceholderText(/token/i)
    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    expect(submitButton).toBeDisabled() // Still need amount and date

    // Fill amount
    const amountInputs = screen.getAllByDisplayValue("")
    await user.type(amountInputs[0], "100")
    expect(submitButton).toBeDisabled() // Still need date

    // Fill unlock date (future date)
    const dateInput = screen.getByLabelText(/unlock date/i)
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    expect(submitButton).not.toBeDisabled()
  })

  it("should reject past dates", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const dateInput = screen.getByLabelText(/unlock date/i)
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 1)
    const dateStr = pastDate.toISOString().split("T")[0]

    await user.type(dateInput, dateStr)
    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    expect(submitButton).toBeDisabled()
  })

  it("should reject zero amounts", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const amountInputs = screen.getAllByDisplayValue("")
    const amountInput = amountInputs[0]
    await user.type(amountInput, "0")

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    expect(submitButton).toBeDisabled()
  })

  it("should show balance when valid token address is entered", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)

    await waitFor(() => {
      expect(screen.getByText(/balance.*5,000/i)).toBeInTheDocument()
    })
  })

  it("should populate beneficiary with connected wallet address by default", () => {
    render(<CreateTokenLockForm />)

    const beneficiaryInput: HTMLInputElement = screen.getByLabelText(/beneficiary/i)
    expect(beneficiaryInput.value).toBe("")
  })

  it("should allow setting custom beneficiary", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const beneficiaryInput = screen.getByLabelText(/beneficiary/i)
    const customBeneficiary = VALID_PUBLIC_KEY

    await user.type(beneficiaryInput, customBeneficiary)
    expect(beneficiaryInput).toHaveValue(customBeneficiary)
  })

  it("should apply preset unlock dates", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const thirtyDaysButton = screen.getByRole("button", { name: /30 days/i })
    await user.click(thirtyDaysButton)

    const dateInput: HTMLInputElement = screen.getByLabelText(/unlock date/i)
    expect(dateInput.value).toBeTruthy()

    const selectedDate = new Date(dateInput.value)
    const today = new Date()
    const diffInDays = Math.floor((selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    expect(diffInDays).toBeGreaterThanOrEqual(29)
    expect(diffInDays).toBeLessThanOrEqual(31)
  })

  it("should handle vesting option", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const vestingCheckbox = screen.getByRole("checkbox")
    expect(vestingCheckbox).not.toBeChecked()

    await user.click(vestingCheckbox)
    expect(vestingCheckbox).toBeChecked()
  })

  it("should show confirmation modal before submission", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    // Fill form
    const tokenInput = screen.getByPlaceholderText(/token/i)
    const dateInput = screen.getByLabelText(/unlock date/i)

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    const amountInputs = screen.getAllByDisplayValue("")
    await user.type(amountInputs[0], "100")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    // Submit form
    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/confirm token lock/i)).toBeInTheDocument()
    })
  })

  it("should handle network errors gracefully", async () => {
    const { createTokenLock } = await import("@/lib/token-locker")
    vi.mocked(createTokenLock).mockRejectedValueOnce(new Error("Network error"))

    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    // Fill and submit form
    const tokenInput = screen.getByPlaceholderText(/token/i)
    const dateInput = screen.getByLabelText(/unlock date/i)

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    const amountInputs = screen.getAllByDisplayValue("")
    await user.type(amountInputs[0], "100")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    await user.click(submitButton)

    // Click confirm
    const confirmButton = await screen.findByRole("button", { name: /confirm & lock/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })

  it("should handle wallet rejection gracefully", async () => {
    const { createTokenLock } = await import("@/lib/token-locker")
    vi.mocked(createTokenLock).mockRejectedValueOnce(new Error("User rejected"))

    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const dateInput = screen.getByLabelText(/unlock date/i)

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    const amountInputs = screen.getAllByDisplayValue("")
    await user.type(amountInputs[0], "100")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    await user.click(submitButton)

    const confirmButton = await screen.findByRole("button", { name: /confirm & lock/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText(/user rejected/i)).toBeInTheDocument()
    })
  })

  it("should show approve button when allowance is insufficient", async () => {
    vi.mocked(useTokenAllowance).mockReturnValue({
      data: 50,
      loading: false,
      error: null,
      reload: vi.fn(),
    })

    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const dateInput = screen.getByLabelText(/unlock date/i)

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    const amountInputs = screen.getAllByDisplayValue("")
    await user.type(amountInputs[0], "100")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/approve & continue/i)).toBeInTheDocument()
    })
  })

  it("should handle approval flow before creating lock", async () => {
    const { submitTokenApproval } = await import("@/lib/stellar")
    vi.mocked(submitTokenApproval).mockResolvedValueOnce(undefined)
    vi.mocked(useTokenAllowance).mockReturnValue({
      data: 50,
      loading: false,
      error: null,
      reload: vi.fn(),
    })

    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const dateInput = screen.getByLabelText(/unlock date/i)

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    const amountInputs = screen.getAllByDisplayValue("")
    await user.type(amountInputs[0], "100")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    await user.click(submitButton)

    const approveButton = await screen.findByRole("button", { name: /approve & continue/i })
    await user.click(approveButton)

    await waitFor(() => {
      expect(submitTokenApproval).toHaveBeenCalled()
    })
  })

  it("should show insufficient balance error when balance < amount", async () => {
    vi.mocked(useTokenBalance).mockReturnValue({
      data: 50,
      loading: false,
      error: null,
      reload: vi.fn(),
    })

    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const dateInput = screen.getByLabelText(/unlock date/i)

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    const amountInputs = screen.getAllByDisplayValue("")
    await user.type(amountInputs[0], "100")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/insufficient balance\./i)).toBeInTheDocument()
    })

    const confirmButton = screen.getByRole("button", { name: /insufficient balance/i })
    expect(confirmButton).toBeDisabled()
  })
})
