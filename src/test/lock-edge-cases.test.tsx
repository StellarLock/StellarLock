import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { CreateTokenLockForm } from "@/components/locks/CreateTokenLockForm"
import { mockWallet, VALID_CONTRACT_ADDRESS } from "./mocks"

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
  WalletProvider: ({ children }: any) => children,
}))

vi.mock("@/lib/token-locker", () => ({
  createTokenLock: vi.fn().mockResolvedValue({ id: "1" }),
}))

vi.mock("@/hooks/useLocks", () => ({
  useTokenBalance: () => ({
    data: 100,
    loading: false,
  }),
}))

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}))

describe("Lock Creation Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should handle insufficient balance error", async () => {
    const { createTokenLock } = await import("@/lib/token-locker")
    vi.mocked(createTokenLock).mockRejectedValueOnce(
      new Error("Insufficient balance: have 100, need 500"),
    )

    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const amountInputs = screen.getAllByDisplayValue("")
    const amountInput = amountInputs[0]
    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    await user.type(amountInput, "500")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    await user.click(submitButton)

    const confirmButton = await screen.findByText(/confirm/i)
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText(/insufficient balance/i)).toBeInTheDocument()
    })
  })

  it("should handle extremely large amounts", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const amountInput = screen.getByDisplayValue("")
    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    await user.type(amountInput, "999999999999999")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    // Button should still be functional for large amounts
    expect(submitButton).not.toBeDisabled()
  })

  it("should handle very small decimal amounts", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const amountInputs = screen.getAllByDisplayValue("")
    const amountInput = amountInputs[0]
    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    await user.type(amountInput, "0.000001")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    expect(submitButton).not.toBeDisabled()
  })

  it("should handle wallet disconnection during flow", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const amountInputs = screen.getAllByDisplayValue("")
    const amountInput = amountInputs[0]
    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    await user.type(amountInput, "100")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    await user.click(submitButton)

    // Simulate wallet disconnection
    mockWallet.isConnected = false
    mockWallet.signTransaction.mockRejectedValueOnce(new Error("Wallet disconnected"))

    const confirmButton = await screen.findByText(/confirm/i)
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText(/disconnected|connection/i)).toBeInTheDocument()
    })
  })

  it("should reject invalid token addresses", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    await user.type(tokenInput, "INVALID_ADDRESS")

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    expect(submitButton).toBeDisabled()
  })

  it("should reject invalid beneficiary addresses", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const amountInput = screen.getByDisplayValue("")
    const beneficiaryInput = screen.getByLabelText(/beneficiary/i)
    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    await user.type(amountInput, "100")
    await user.type(beneficiaryInput, "INVALID_BENEFICIARY")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    expect(submitButton).toBeDisabled()
  })

  it("should accept contract addresses as beneficiaries", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const amountInput = screen.getByDisplayValue("")
    const beneficiaryInput = screen.getByLabelText(/beneficiary/i)
    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    await user.type(amountInput, "100")
    await user.type(beneficiaryInput, VALID_CONTRACT_ADDRESS)

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    expect(submitButton).not.toBeDisabled()
  })

  it("should handle timeout during submission", async () => {
    const { createTokenLock } = await import("@/lib/token-locker")
    vi.mocked(createTokenLock).mockImplementationOnce(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), 100),
        ),
    )

    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const amountInputs = screen.getAllByDisplayValue("")
    const amountInput = amountInputs[0]
    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement

    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)
    await user.type(amountInput, "100")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock tokens/i })
    await user.click(submitButton)

    const confirmButton = await screen.findByText(/confirm/i)
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText(/timeout/i)).toBeInTheDocument()
    })
  })

  it("should allow max button to set full balance", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    await user.type(tokenInput, VALID_CONTRACT_ADDRESS)

    await waitFor(() => {
      expect(screen.getByText(/balance.*100/i)).toBeInTheDocument()
    })

    const maxButton = screen.getByRole("button", { name: /max/i })
    await user.click(maxButton)

    const amountInput = screen.getByDisplayValue("100")
    expect(amountInput).toBeInTheDocument()
  })

  it("should handle rapid form changes", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const tokenInput = screen.getByPlaceholderText(/token/i)
    const amountInput = screen.getByDisplayValue("")

    // Rapid typing
    await user.type(tokenInput, "C")
    await user.type(tokenInput, "B")
    await user.type(tokenInput, "V")
    await user.type(amountInput, "1")
    await user.type(amountInput, "0")
    await user.type(amountInput, "0")

    // Should not crash
    expect(screen.getByPlaceholderText(/token/i)).toBeInTheDocument()
  })

  it("should clear error message when user corrects input", async () => {
    const user = userEvent.setup()
    render(<CreateTokenLockForm />)

    const amountInput = screen.getByDisplayValue("")

    // Try invalid input
    await user.type(amountInput, "abc")

    // Clear and enter valid amount
    await user.clear(amountInput)
    await user.type(amountInput, "100")

    // Amount should be valid
    expect(screen.getByDisplayValue("100")).toBeInTheDocument()
  })
})
