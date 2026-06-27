import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { CreateLpLockForm } from "@/components/locks/CreateLpLockForm"
import { mockWallet, VALID_CONTRACT_ADDRESS } from "./mocks"

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
  WalletProvider: ({ children }: any) => children,
}))

vi.mock("@/lib/lp-locker", () => ({
  createLpLock: vi.fn().mockResolvedValue({ id: "2" }),
}))

vi.mock("@/hooks/useLocks", () => ({
  useTokenBalance: () => ({
    data: 1000,
    loading: false,
  }),
}))

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}))

describe("LP Lock Creation Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should render LP lock form with DEX selection", () => {
    render(<CreateLpLockForm />)

    expect(screen.getByText(/dex/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /aquarius/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /soroswap/i })).toBeInTheDocument()
  })

  it("should allow DEX selection", async () => {
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    const aquariusButton = screen.getByRole("button", { name: /aquarius/i })
    await user.click(aquariusButton)

    expect(aquariusButton).toHaveClass(/primary|selected/)
  })

  it("should validate LP lock form inputs", async () => {
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    const submitButton = screen.getByRole("button", { name: /lock/i })
    expect(submitButton).toBeDisabled()

    // Select DEX
    const aquariusButton = screen.getByRole("button", { name: /aquarius/i })
    await user.click(aquariusButton)

    // Fill amount
    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/lp amount/i), "100")

    // Fill unlock date
    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled()
    })
  })

  it("should validate pool pair selection", async () => {
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    // DEX should be required before showing pool selection
    const submitButton = screen.getByRole("button", { name: /lock/i })
    expect(submitButton).toBeDisabled()

    const aquariusButton = screen.getByRole("button", { name: /aquarius/i })
    await user.click(aquariusButton)

    // Now pool selection options should appear or be required
    expect(screen.queryByText(/pool/i)).toBeInTheDocument()
  })

  it("should reject past unlock dates", async () => {
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 1)
    const dateStr = pastDate.toISOString().split("T")[0]

    await user.type(dateInput, dateStr)
    const submitButton = screen.getByRole("button", { name: /lock/i })
    expect(submitButton).toBeDisabled()
  })

  it("should handle LP lock creation error", async () => {
    const { createLpLock } = await import("@/lib/lp-locker")
    vi.mocked(createLpLock).mockRejectedValueOnce(new Error("Insufficient liquidity"))

    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    // Fill form
    const aquariusButton = screen.getByRole("button", { name: /aquarius/i })
    await user.click(aquariusButton)

    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/lp amount/i), "100")

    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock/i })
    await user.click(submitButton)

    const confirmButton = await screen.findByText(/confirm/i)
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText(/insufficient liquidity/i)).toBeInTheDocument()
    })
  })

  it("should use connected wallet as beneficiary", async () => {
    const { createLpLock } = await import("@/lib/lp-locker")
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/lp amount/i), "100")

    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    await user.click(screen.getByRole("button", { name: /lock/i }))
    await user.click(await screen.findByText(/confirm/i))

    await waitFor(() => {
      expect(createLpLock).toHaveBeenCalledWith(
        expect.objectContaining({ beneficiary: mockWallet.address }),
        mockWallet.address,
        mockWallet.signTransaction,
      )
    })
  })

  it("should handle double-submission prevention", async () => {
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    const aquariusButton = screen.getByRole("button", { name: /aquarius/i })
    await user.click(aquariusButton)

    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/lp amount/i), "100")

    const dateInput = screen.getByLabelText(/unlock date/i) as HTMLInputElement
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock/i })
    await user.click(submitButton)

    const confirmButton = await screen.findByText(/confirm/i)
    await user.click(confirmButton)

    // Button should be disabled while submitting
    await waitFor(() => {
      expect(confirmButton).toBeDisabled()
    })
  })
})
