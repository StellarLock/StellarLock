import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import i18n from "@/i18n"
import { AnnouncerProvider } from "@/hooks/AnnouncerProvider"
import { LockDetail } from "@/pages/LockDetail"
import { useVerifiedToken } from "@/hooks/useVerifiedToken"
import { mockLock, mockWallet } from "./mocks"

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
  useVerifiedToken: vi.fn(),
}))

vi.mock("@/lib/token-locker", () => ({
  withdrawLock: vi.fn(),
  extendLock: vi.fn(),
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

describe("LockDetail unverified-token warning banner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the warning banner when useVerifiedToken returns false", () => {
    vi.mocked(useVerifiedToken).mockReturnValue(false)
    renderLockDetail()

    expect(screen.getByText(i18n.t("lockDetail.unverifiedWarning"))).toBeInTheDocument()
  })

  it("does not render the warning banner when useVerifiedToken returns true", () => {
    vi.mocked(useVerifiedToken).mockReturnValue(true)
    renderLockDetail()

    expect(screen.queryByText(i18n.t("lockDetail.unverifiedWarning"))).not.toBeInTheDocument()
  })
})
