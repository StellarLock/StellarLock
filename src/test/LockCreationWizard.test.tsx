import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { LockCreationWizard } from "@/components/locks/wizard/LockCreationWizard"
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

vi.mock("@/hooks/useTokenBalanceSWR", () => ({
  useTokenBalanceSWR: () => ({
    balance: null,
    isLoading: false,
    isRevalidating: false,
    revalidate: vi.fn(),
  }),
}))

vi.mock("@/lib/token-locker", () => ({
  createTokenLock: vi.fn().mockResolvedValue({ id: "lock-123", txHash: "mock-tx-hash" }),
}))

vi.mock("@/lib/lp-locker", () => ({
  createLpLock: vi.fn().mockResolvedValue({ id: "lock-456", txHash: "mock-tx-hash" }),
}))

vi.mock("@/hooks/useNotifications", () => ({
  addNotification: vi.fn(),
}))

function futureDateString(daysFromNow = 30) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

async function advanceToStep3AsTokenLock() {
  const user = userEvent.setup()
  render(<LockCreationWizard />)

  // Step 1: lock type defaults to "token", so Next is already enabled.
  await user.click(screen.getByRole("button", { name: /^next$/i }))

  // Step 2: token contract address.
  await user.type(screen.getByLabelText(/token contract address/i), VALID_CONTRACT_ADDRESS)
  await user.click(screen.getByRole("button", { name: /^next$/i }))

  return user
}

describe("LockCreationWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it("renders step 1 with both lock type options", () => {
    render(<LockCreationWizard />)
    expect(screen.getByRole("button", { name: /token lock/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /lp lock/i })).toBeInTheDocument()
  })

  it("does not render a Back button on step 1", () => {
    render(<LockCreationWizard />)
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument()
  })

  it("advances to step 2 when Next is clicked on step 1", async () => {
    const user = userEvent.setup()
    render(<LockCreationWizard />)
    await user.click(screen.getByRole("button", { name: /^next$/i }))
    expect(screen.getByText(/select token/i)).toBeInTheDocument()
  })

  it("disables Next on step 2 until a valid token contract address is entered", async () => {
    const user = userEvent.setup()
    render(<LockCreationWizard />)
    await user.click(screen.getByRole("button", { name: /^next$/i }))

    const nextButton = screen.getByRole("button", { name: /^next$/i })
    expect(nextButton).toBeDisabled()

    await user.type(screen.getByLabelText(/token contract address/i), VALID_CONTRACT_ADDRESS)
    await waitFor(() => {
      expect(nextButton).not.toBeDisabled()
    })
  })

  it("shows pool/DEX fields on step 2 when LP Lock is selected", async () => {
    const user = userEvent.setup()
    render(<LockCreationWizard />)
    await user.click(screen.getByRole("button", { name: /lp lock/i }))
    await user.click(screen.getByRole("button", { name: /^next$/i }))

    expect(screen.getByText(/select liquidity pool/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pool share contract address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^token a$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^token b$/i)).toBeInTheDocument()
  })

  it("advances to step 3 (Lock Parameters) once step 2 is valid", async () => {
    await advanceToStep3AsTokenLock()
    expect(screen.getByText(/lock parameters/i)).toBeInTheDocument()
  })

  it("disables Next on step 3 until amount and a future unlock date are set", async () => {
    const user = await advanceToStep3AsTokenLock()

    const nextButton = screen.getByRole("button", { name: /^next$/i })
    expect(nextButton).toBeDisabled()

    await user.type(screen.getByLabelText(/^amount$/i), "100")
    expect(nextButton).toBeDisabled()

    await user.type(screen.getByLabelText(/unlock date/i), futureDateString())
    await waitFor(() => {
      expect(nextButton).not.toBeDisabled()
    })
  })

  it("keeps Next disabled on step 3 for a past unlock date", async () => {
    const user = await advanceToStep3AsTokenLock()

    await user.type(screen.getByLabelText(/^amount$/i), "100")
    const past = new Date()
    past.setDate(past.getDate() - 1)
    await user.type(screen.getByLabelText(/unlock date/i), past.toISOString().slice(0, 10))

    expect(screen.getByRole("button", { name: /^next$/i })).toBeDisabled()
  })

  it("shows the entered amount on the review step", async () => {
    const user = await advanceToStep3AsTokenLock()
    await user.type(screen.getByLabelText(/^amount$/i), "250")
    await user.type(screen.getByLabelText(/unlock date/i), futureDateString())
    await user.click(screen.getByRole("button", { name: /^next$/i }))

    expect(screen.getByText(/review & confirm/i)).toBeInTheDocument()
    expect(screen.getByText("250")).toBeInTheDocument()
    expect(screen.getByText(/token lock/i)).toBeInTheDocument()
  })

  it("navigates back a step when Back is clicked", async () => {
    const user = userEvent.setup()
    render(<LockCreationWizard />)
    await user.click(screen.getByRole("button", { name: /^next$/i }))
    expect(screen.getByText(/select token/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /back/i }))
    expect(screen.getByRole("button", { name: /token lock/i })).toBeInTheDocument()
  })

  it("calls createTokenLock and navigates to the locks list on successful submit", async () => {
    const { createTokenLock } = await import("@/lib/token-locker")
    const user = await advanceToStep3AsTokenLock()
    await user.type(screen.getByLabelText(/^amount$/i), "100")
    await user.type(screen.getByLabelText(/unlock date/i), futureDateString())
    await user.click(screen.getByRole("button", { name: /^next$/i }))

    await user.click(screen.getByRole("button", { name: /submit lock/i }))

    await waitFor(() => {
      expect(createTokenLock).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenAddress: VALID_CONTRACT_ADDRESS,
          amount: 100,
        }),
        mockWallet.address,
        mockWallet.signTransaction,
        expect.any(Function),
      )
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/app/locks")
    })
  })

  it("shows an error alert instead of navigating when submission fails", async () => {
    const { createTokenLock } = await import("@/lib/token-locker")
    vi.mocked(createTokenLock).mockRejectedValueOnce(new Error("network down"))

    const user = await advanceToStep3AsTokenLock()
    await user.type(screen.getByLabelText(/^amount$/i), "100")
    await user.type(screen.getByLabelText(/unlock date/i), futureDateString())
    await user.click(screen.getByRole("button", { name: /^next$/i }))
    await user.click(screen.getByRole("button", { name: /submit lock/i }))

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("defaults the beneficiary to the connected wallet address when left blank", async () => {
    const { createTokenLock } = await import("@/lib/token-locker")
    const user = await advanceToStep3AsTokenLock()
    await user.type(screen.getByLabelText(/^amount$/i), "100")
    await user.type(screen.getByLabelText(/unlock date/i), futureDateString())
    await user.click(screen.getByRole("button", { name: /^next$/i }))
    await user.click(screen.getByRole("button", { name: /submit lock/i }))

    await waitFor(() => {
      expect(createTokenLock).toHaveBeenCalledWith(
        expect.objectContaining({ beneficiary: mockWallet.address }),
        mockWallet.address,
        mockWallet.signTransaction,
        expect.any(Function),
      )
    })
  })
})
