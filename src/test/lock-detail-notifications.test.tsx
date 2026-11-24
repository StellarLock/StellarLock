import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import i18n from "@/i18n"
import { AnnouncerProvider } from "@/hooks/useAnnouncer"
import { LockDetail } from "@/pages/LockDetail"
import { resetNotificationStore } from "@/hooks/useNotifications"
import { mockLock, mockWallet, VALID_PUBLIC_KEY } from "./mocks"

// The wallet owns the lock, so withdraw / extend / transfer are all offered.
const unlockedLock = { ...mockLock, unlockAt: Date.now() - 60_000, metadata: {} }

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/hooks/useLocks", () => ({
  useLock: vi.fn(() => ({ data: unlockedLock, loading: false, error: null, reload: vi.fn() })),
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

const NOTIFICATION_HISTORY_KEY = "stellarlock:notification_history"

function readNotificationHistory(): { type: string; lockId: string; message: string; read: boolean }[] {
  return JSON.parse(localStorage.getItem(NOTIFICATION_HISTORY_KEY) ?? "[]") as {
    type: string
    lockId: string
    message: string
    read: boolean
  }[]
}

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

describe("LockDetail notification center entries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetNotificationStore()
  })

  it("records a notification after a successful withdrawal", async () => {
    const user = userEvent.setup()
    renderLockDetail()

    await user.click(screen.getByRole("button", { name: /withdraw tokens/i }))

    await waitFor(() => {
      expect(readNotificationHistory()).toHaveLength(1)
    })
    const [entry] = readNotificationHistory()
    expect(entry.type).toBe("lock_withdrawn")
    expect(entry.lockId).toBe("1")
    expect(entry.read).toBe(false)
  })

  it("records a notification after a successful extension", async () => {
    const user = userEvent.setup()
    renderLockDetail()

    await user.click(screen.getByRole("button", { name: /extend lock/i }))

    const laterDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await user.type(screen.getByLabelText(/new unlock date/i), laterDate)
    await user.click(screen.getByRole("button", { name: /confirm extension/i }))

    await waitFor(() => {
      expect(readNotificationHistory()).toHaveLength(1)
    })
    expect(readNotificationHistory()[0].type).toBe("lock_extended")
  })

  it("records a notification after transferring the beneficiary", async () => {
    const user = userEvent.setup()
    renderLockDetail()

    await user.click(screen.getByRole("button", { name: /transfer beneficiary/i }))
    await user.type(screen.getByLabelText(/new beneficiary address/i), VALID_PUBLIC_KEY)
    await user.click(screen.getByRole("button", { name: /confirm transfer/i }))

    await waitFor(() => {
      expect(readNotificationHistory()).toHaveLength(1)
    })
    expect(readNotificationHistory()[0].type).toBe("beneficiary_transfer")
  })

  it("records nothing when the transaction fails", async () => {
    const { withdrawLock } = await import("@/lib/token-locker")
    vi.mocked(withdrawLock).mockRejectedValueOnce(new Error("User rejected"))

    const user = userEvent.setup()
    renderLockDetail()

    await user.click(screen.getByRole("button", { name: /withdraw tokens/i }))

    await waitFor(() => {
      expect(screen.getByText(/transaction cancelled/i)).toBeInTheDocument()
    })
    expect(readNotificationHistory()).toHaveLength(0)
  })
})
