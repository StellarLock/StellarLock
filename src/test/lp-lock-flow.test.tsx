import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { CreateLpLockForm } from "@/components/locks/CreateLpLockForm"
import { mockWallet, VALID_CONTRACT_ADDRESS } from "./mocks"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/lib/lp-locker", () => ({
  createLpLock: vi.fn().mockResolvedValue({ id: "2", txHash: "mock-tx-hash" }),
  submitTokenApproval: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/hooks/useLocks", () => ({
  useTokenBalance: vi.fn(() => ({
    data: 1000,
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

describe("LP Lock Creation Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should render LP lock form with DEX selection", () => {
    render(<CreateLpLockForm />)

    expect(screen.getByText(/^dex$/i)).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /aquarius/i })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /soroswap/i })).toBeInTheDocument()
  })

  it("should allow DEX selection", async () => {
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    const aquariusButton = screen.getByRole("radio", { name: /aquarius/i })
    await user.click(aquariusButton)

    expect(aquariusButton).toHaveClass(/primary|selected/)
  })

  it("should validate LP lock form inputs", async () => {
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    const submitButton = screen.getByRole("button", { name: /lock liquidity/i })
    expect(submitButton).toBeDisabled()

    // Select DEX
    const aquariusButton = screen.getByRole("radio", { name: /aquarius/i })
    await user.click(aquariusButton)

    // Fill amount
    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/lp amount/i), "100")

    // Fill unlock date
    const dateInput = screen.getByLabelText(/unlock date/i)
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
    const submitButton = screen.getByRole("button", { name: /lock liquidity/i })
    expect(submitButton).toBeDisabled()

    const aquariusButton = screen.getByRole("radio", { name: /aquarius/i })
    await user.click(aquariusButton)

    // Now pool selection options should appear or be required
    expect(screen.getByLabelText(/pool share token address/i)).toBeInTheDocument()
  })

  it("should reject past unlock dates", async () => {
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    const dateInput = screen.getByLabelText(/unlock date/i)
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 1)
    const dateStr = pastDate.toISOString().split("T")[0]

    await user.type(dateInput, dateStr)
    const submitButton = screen.getByRole("button", { name: /lock liquidity/i })
    expect(submitButton).toBeDisabled()
  })

  it("should handle LP lock creation error", async () => {
    const { createLpLock } = await import("@/lib/lp-locker")
    vi.mocked(createLpLock).mockRejectedValueOnce(new Error("Insufficient liquidity"))

    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    // Fill form
    const aquariusButton = screen.getByRole("radio", { name: /aquarius/i })
    await user.click(aquariusButton)

    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/lp amount/i), "100")

    const dateInput = screen.getByLabelText(/unlock date/i)
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock liquidity/i })
    await user.click(submitButton)

    const confirmButton = await screen.findByRole("button", { name: /confirm & lock/i })
    await user.click(confirmButton)

    // Unrecognised errors are sanitized to the generic message.
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/insufficient liquidity/i)).not.toBeInTheDocument()
  })

  it("should use connected wallet as beneficiary", async () => {
    const { createLpLock } = await import("@/lib/lp-locker")
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/lp amount/i), "100")

    const dateInput = screen.getByLabelText(/unlock date/i)
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    await user.click(screen.getByRole("button", { name: /lock liquidity/i }))
    await user.click(await screen.findByRole("button", { name: /confirm & lock/i }))

    await waitFor(() => {
      expect(createLpLock).toHaveBeenCalledWith(
        expect.objectContaining({ beneficiary: mockWallet.address }),
        mockWallet.address,
        mockWallet.signTransaction,
        expect.any(Function),
      )
    })
  })

  it("locks for the typed beneficiary override instead of the connected wallet", async () => {
    const OVERRIDE_BENEFICIARY = "GA5DTCACZO4727N6LG5L3A54WQENY73CFESY2GLSKM5X6XEMY6IOJGUI"
    const { createLpLock } = await import("@/lib/lp-locker")
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/lp amount/i), "100")
    await user.type(screen.getByLabelText(/beneficiary/i), OVERRIDE_BENEFICIARY)

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    await user.type(screen.getByLabelText(/unlock date/i), futureDate.toISOString().split("T")[0])

    await user.click(screen.getByRole("button", { name: /lock liquidity/i }))

    // The confirmation preview shows the typed override (rendered shortened,
    // e.g. "GA5DTCAC…MY6IOJGUI"), not the wallet address.
    expect(
      await screen.findByText(`${OVERRIDE_BENEFICIARY.slice(0, 8)}…${OVERRIDE_BENEFICIARY.slice(-8)}`),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(`${mockWallet.address.slice(0, 8)}…${mockWallet.address.slice(-8)}`),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /confirm & lock/i }))

    await waitFor(() => {
      expect(createLpLock).toHaveBeenCalledWith(
        expect.objectContaining({ beneficiary: OVERRIDE_BENEFICIARY }),
        mockWallet.address,
        mockWallet.signTransaction,
        expect.any(Function),
      )
    })
  })

  it("navigates to the LP detail route after creating a lock", async () => {
    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/lp amount/i), "100")

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    await user.type(screen.getByLabelText(/unlock date/i), futureDate.toISOString().split("T")[0])

    await user.click(screen.getByRole("button", { name: /lock liquidity/i }))
    await user.click(await screen.findByRole("button", { name: /confirm & lock/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/app/lock/lp/2")
    })
  })

  it("should handle double-submission prevention", async () => {
    const { createLpLock } = await import("@/lib/lp-locker")
    let resolveCreate!: (value: { id: string; txHash: string }) => void
    vi.mocked(createLpLock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )

    const user = userEvent.setup()
    render(<CreateLpLockForm />)

    const aquariusButton = screen.getByRole("radio", { name: /aquarius/i })
    await user.click(aquariusButton)

    await user.type(screen.getByLabelText(/pool share token address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token a address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/token b address/i), VALID_CONTRACT_ADDRESS)
    await user.type(screen.getByLabelText(/lp amount/i), "100")

    const dateInput = screen.getByLabelText(/unlock date/i)
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30)
    const dateStr = futureDate.toISOString().split("T")[0]
    await user.type(dateInput, dateStr)

    const submitButton = screen.getByRole("button", { name: /lock liquidity/i })
    await user.click(submitButton)

    const confirmButton = await screen.findByRole("button", { name: /confirm & lock/i })
    await user.click(confirmButton)

    // Button should be disabled while the creation call is still pending
    await waitFor(() => {
      expect(confirmButton).toBeDisabled()
    })

    resolveCreate({ id: "2", txHash: "mock-tx-hash" })
    expect(createLpLock).toHaveBeenCalledTimes(1)
  })
})
