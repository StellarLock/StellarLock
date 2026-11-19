import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import i18n from "@/i18n"
import { AnnouncerProvider } from "@/hooks/AnnouncerProvider"
import { LockDetail } from "@/pages/LockDetail"
import { mockLock, mockWallet } from "./mocks"

// The wallet owns the lock, so the extend panel is offered.
const activeLock = { ...mockLock, unlockAt: Date.now() + 86400000 * 30, metadata: {} }

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
}))

vi.mock("@/hooks/WalletProvider", () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/hooks/useLocks", () => ({
  useLock: vi.fn(() => ({ data: activeLock, loading: false, error: null, reload: vi.fn() })),
}))

vi.mock("@/hooks/useVerifiedToken", () => ({
  useVerifiedToken: () => null,
}))

vi.mock("@/lib/token-locker", () => ({
  withdrawLock: vi.fn(),
  extendLock: vi.fn().mockResolvedValue({ txHash: "tx_extend" }),
  transferBeneficiary: vi.fn(),
}))

vi.mock("@/lib/lp-locker", () => ({
  withdrawLpLock: vi.fn(),
  extendLpLock: vi.fn(),
  transferLpBeneficiary: vi.fn(),
}))

vi.mock("@/lib/pdf-report", () => ({
  downloadLockReport: vi.fn(),
}))

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}))

function renderLockDetail() {
  return render(
    <HelmetProvider>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/app/lock/token/1"]}>
          <AnnouncerProvider>
            <Routes>
              <Route path="/app/lock/token/:id" element={<LockDetail />} />
            </Routes>
          </AnnouncerProvider>
        </MemoryRouter>
      </I18nextProvider>
    </HelmetProvider>,
  )
}

describe("LockDetail extend-date validation (validateExtendDate)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects a new unlock date at or before the current unlock date", async () => {
    const user = userEvent.setup()
    renderLockDetail()

    await user.click(screen.getByRole("button", { name: /extend lock/i }))

    // The lock's current unlockAt is ~30 days out — typing today's date is
    // strictly before it, which validateExtendDate must reject.
    const earlierDate = new Date().toISOString().slice(0, 10)
    await user.type(screen.getByLabelText(/new unlock date/i), earlierDate)
    await user.click(screen.getByRole("button", { name: /confirm extension/i }))

    expect(
      await screen.findByText(/later than the current unlock date/i),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /confirm extension/i })).toBeDisabled()
  })

  it("accepts a new unlock date after the current unlock date", async () => {
    const user = userEvent.setup()
    renderLockDetail()

    await user.click(screen.getByRole("button", { name: /extend lock/i }))

    const laterDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await user.type(screen.getByLabelText(/new unlock date/i), laterDate)

    expect(screen.getByRole("button", { name: /confirm extension/i })).toBeEnabled()
    expect(screen.queryByText(/later than the current unlock date/i)).not.toBeInTheDocument()
  })
})
