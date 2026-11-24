import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import i18n from "@/i18n"
import { AnnouncerProvider } from "@/hooks/AnnouncerProvider"
import { LockDetail } from "@/pages/LockDetail"
import { useVerifiedToken, useVerifiedPool, isVerifiedPool } from "@/hooks/useVerifiedToken"
import { mockLock, mockWallet } from "./mocks"

const activeLock = { ...mockLock, unlockAt: Date.now() + 86400000 * 30, metadata: {} }

const activeLpLock = {
  ...activeLock,
  kind: "lp",
  poolShare: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
}

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
}))

vi.mock("@/hooks/WalletProvider", () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/hooks/useLocks", () => ({
  useLock: vi.fn(() => ({ data: activeLock, loading: false, error: null, reload: vi.fn() })),
  useLpLock: vi.fn(() => ({ data: activeLpLock, loading: false, error: null, reload: vi.fn() })),
}))

vi.mock("@/hooks/useVerifiedToken", () => ({
  useVerifiedToken: vi.fn(),
  useVerifiedPool: vi.fn(),
  isVerifiedPool: vi.fn(),
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

describe("LockDetail unverified-pool warning banner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useVerifiedToken).mockReturnValue(true)
  })

  it("renders the unverified pool warning for an LP lock with an unknown pool", () => {
    vi.mocked(useVerifiedPool).mockReturnValue(false)
    renderLockDetail()

    expect(screen.getByText(i18n.t("lockDetail.unverifiedPoolWarning"))).toBeInTheDocument()
  })

  it("does not render the unverified pool warning for a verified pool", () => {
    vi.mocked(useVerifiedPool).mockReturnValue(true)
    renderLockDetail()

    expect(screen.queryByText(i18n.t("lockDetail.unverifiedPoolWarning"))).not.toBeInTheDocument()
  })
})

describe("isVerifiedPool pool classification", () => {
  it("returns true for a curated Aquarius/Soroswap pool address", () => {
    vi.mocked(isVerifiedPool).mockReturnValue(true)
    expect(isVerifiedPool("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM")).toBe(true)
  })

  it("returns false for an arbitrary contract address", () => {
    vi.mocked(isVerifiedPool).mockReturnValue(false)
    expect(isVerifiedPool("CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")).toBe(false)
  })
})
