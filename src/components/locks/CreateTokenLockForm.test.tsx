import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import "@/i18n"
import { CreateTokenLockForm } from "@/components/locks/CreateTokenLockForm"

const mockSignTransaction = vi.fn()

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => ({
    address: "GALICE000000000000000000000000000000000000000000000000",
    signTransaction: mockSignTransaction,
  }),
}))

vi.mock("@/lib/token-locker", () => ({
  createTokenLock: vi.fn().mockResolvedValue({ id: "42", hash: "deadbeef" }),
}))

const addTransactionMock = vi.fn()
vi.mock("@/lib/transaction-history", () => ({
  addTransaction: (...args: unknown[]) => addTransactionMock(...args),
}))

const navigateMock = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => navigateMock }
})

describe("CreateTokenLockForm", () => {
  beforeEach(() => {
    addTransactionMock.mockClear()
    navigateMock.mockClear()
  })

  it("records a transaction on successful lock creation", async () => {
    render(
      <MemoryRouter>
        <CreateTokenLockForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/token contract address/i), {
      target: { value: "CTOKENADDRESS000000000000000000000000000000000000000000" },
    })
    fireEvent.change(screen.getByLabelText(/amount to lock/i), { target: { value: "100" } })

    const minDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    fireEvent.change(screen.getByLabelText(/^unlock date$/i), { target: { value: minDate } })

    fireEvent.click(screen.getByRole("button", { name: /lock tokens/i }))

    await waitFor(() => {
      expect(addTransactionMock).toHaveBeenCalledTimes(1)
    })

    expect(addTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: "deadbeef",
        action: "create_token_lock",
        kind: "token",
        lockId: "42",
        amount: 100,
      }),
    )
    expect(navigateMock).toHaveBeenCalledWith("/app/lock/42")
  })
})
