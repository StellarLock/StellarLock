import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import i18n from "@/i18n"
import { AnnouncerProvider } from "@/hooks/AnnouncerProvider"
import { LockDetail } from "@/pages/LockDetail"
import { mockLock, mockWallet } from "./mocks"

/**
 * Issue #710: LockDetail's vesting-schedule rendering and claimable-amount
 * calculation (`vestingClaimable`) are completely untested because the
 * shared `mockLock` fixture has no `vesting` field, so this whole block of
 * the component is never exercised by any existing test.
 *
 * `vestingClaimable` = linearly-vested-to-date minus already-released:
 *   amount * (min(now, end) - start) / (end - start) - released
 */

const DAY_MS = 24 * 60 * 60 * 1000
const now = Date.now()

// A lock exactly halfway through a 100-day linear vesting schedule, already
// past its unlock time so the (vesting-aware) withdraw button is shown too.
const vestingLock = {
  ...mockLock,
  unlockAt: now - 60_000,
  amount: 1000,
  vesting: {
    start: now - 50 * DAY_MS,
    end: now + 50 * DAY_MS,
    released: 0,
  },
}

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
}))

vi.mock("@/hooks/WalletProvider", () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/hooks/useLocks", () => ({
  useLock: vi.fn(() => ({ data: vestingLock, loading: false, error: null, reload: vi.fn() })),
}))

vi.mock("@/hooks/useVerifiedToken", () => ({
  useVerifiedToken: () => null,
}))

vi.mock("@/lib/token-locker", () => ({
  withdrawLock: vi.fn().mockResolvedValue({ txHash: "tx_withdraw" }),
  extendLock: vi.fn().mockResolvedValue({ txHash: "tx_extend" }),
  transferBeneficiary: vi.fn().mockResolvedValue({ txHash: "tx_transfer" }),
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

describe("LockDetail vesting schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the vesting-schedule section with the correct progress percentage", () => {
    renderLockDetail()

    expect(screen.getByText("Vesting Schedule")).toBeInTheDocument()
    // Halfway through a 100-day schedule → ~50% progress.
    expect(screen.getByText("50%")).toBeInTheDocument()
  })

  it("renders Total, Released, and Claimable using the vestingClaimable formula", () => {
    renderLockDetail()

    // Total = lock.amount (1000, thousands-separated by Intl formatting).
    expect(screen.getByText("Total")).toBeInTheDocument()
    expect(screen.getByText(/1,000\s*USDC/)).toBeInTheDocument()

    // Released = lock.vesting.released (0).
    expect(screen.getByText("Released")).toBeInTheDocument()

    // Claimable = 1000 * (50 days / 100 days) - 0 = 500.
    expect(screen.getByText("Claimable")).toBeInTheDocument()
    expect(screen.getByText(/500\s*USDC/)).toBeInTheDocument()
  })

  it("shows the vesting-aware withdraw label with the claimable amount, not the generic label", () => {
    renderLockDetail()

    expect(screen.getByRole("button", { name: /claim 500 USDC \(vested\)/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^withdraw tokens$/i })).not.toBeInTheDocument()
  })

  it("computes zero claimable once everything vested has already been released", async () => {
    const fullyReleasedLock = {
      ...vestingLock,
      vesting: { ...vestingLock.vesting, released: 500 },
    }
    const { useLock } = await import("@/hooks/useLocks")
    vi.mocked(useLock).mockReturnValue({
      data: fullyReleasedLock,
      loading: false,
      error: null,
      reload: vi.fn(),
    })

    renderLockDetail()

    expect(screen.getByText("Claimable")).toBeInTheDocument()
    expect(screen.getByText(/^0(\.00)?\s*USDC/)).toBeInTheDocument()
  })
})
