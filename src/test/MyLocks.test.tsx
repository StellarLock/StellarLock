import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router-dom"
import i18n from "@/i18n"
import { MyLocks } from "@/pages/MyLocks"
import { mockLock, mockWallet } from "./mocks"

/**
 * Issue #712: MyLocks' `filteredList` pipeline (search box, status filter,
 * kind filter, and the three sort options) has no test coverage at all — a
 * regression here would silently show the wrong subset of a user's locks.
 *
 * Strategy: seed `useMyLocks` with a small, deliberately mixed set of locks
 * (different status/kind/symbol/amount/createdAt/unlockAt) and drive the
 * real MyLocks page's search/filter/sort controls.
 */

const now = Date.now()

const lockUsdcLocked = {
  ...mockLock,
  id: "1",
  kind: "token" as const,
  status: "locked" as const,
  token: { ...mockLock.token, symbol: "USDC" },
  amount: 100,
  createdAt: now - 3_000,
  unlockAt: now + 300_000,
}

const lockXlmLpUnlockable = {
  ...mockLock,
  id: "2",
  kind: "lp" as const,
  status: "unlockable" as const,
  token: { ...mockLock.token, symbol: "XLM" },
  amount: 500,
  createdAt: now - 2_000,
  unlockAt: now + 100_000,
}

const lockBtcWithdrawn = {
  ...mockLock,
  id: "3",
  kind: "token" as const,
  status: "withdrawn" as const,
  token: { ...mockLock.token, symbol: "BTC" },
  amount: 50,
  createdAt: now - 1_000,
  unlockAt: now + 50_000,
}

const mixedLocks = [lockUsdcLocked, lockXlmLpUnlockable, lockBtcWithdrawn]

const mockUseMyLocks = vi.fn()
const mockUseMyLocksStats = vi.fn()

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
}))

vi.mock("@/hooks/useLocks", () => ({
  ALL_LOCKS_LIMIT: 10_000,
  useMyLocks: (...args: unknown[]) => mockUseMyLocks(...args),
  useMyLocksStats: (...args: unknown[]) => mockUseMyLocksStats(...args),
}))

vi.mock("@/hooks/useVerifiedToken", () => ({
  useVerifiedToken: () => null,
}))

vi.mock("@/lib/token-locker", () => ({
  extendLock: vi.fn(),
  transferBeneficiary: vi.fn(),
}))

vi.mock("@/lib/lp-locker", () => ({
  extendLpLock: vi.fn(),
  transferLpBeneficiary: vi.fn(),
}))

vi.mock("@/lib/export", () => ({
  exportToCSV: vi.fn(),
  exportToJSON: vi.fn(),
}))

function renderMyLocks() {
  return render(
    <HelmetProvider>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/app/locks"]}>
          <MyLocks />
        </MemoryRouter>
      </I18nextProvider>
    </HelmetProvider>,
  )
}

/** Order in which the three mixed locks currently appear on the page. */
function visibleLockOrder(): string[] {
  return screen.getAllByText(/^Lock #/).map((el) => el.textContent ?? "")
}

describe("MyLocks filter/search/sort pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseMyLocks.mockReturnValue({
      data: { created: mixedLocks, received: [], totalCreated: mixedLocks.length, totalReceived: 0 },
      loading: false,
      error: null,
      reload: vi.fn(),
    })
    mockUseMyLocksStats.mockReturnValue({
      data: { totalValue: 650, unlockable: 1 },
      loading: false,
      error: null,
      reload: vi.fn(),
    })
  })

  it("shows every lock with no filters applied", () => {
    renderMyLocks()

    expect(screen.getByText("USDC")).toBeInTheDocument()
    expect(screen.getByText("XLM")).toBeInTheDocument()
    expect(screen.getByText("BTC")).toBeInTheDocument()
  })

  it("filters by status", async () => {
    const user = userEvent.setup()
    renderMyLocks()

    await user.selectOptions(screen.getByLabelText(/filter by status/i), "withdrawn")

    expect(screen.getByText("BTC")).toBeInTheDocument()
    expect(screen.queryByText("USDC")).not.toBeInTheDocument()
    expect(screen.queryByText("XLM")).not.toBeInTheDocument()
  })

  it("filters by kind", async () => {
    const user = userEvent.setup()
    renderMyLocks()

    await user.selectOptions(screen.getByLabelText(/filter by type/i), "lp")

    expect(screen.getByText("XLM")).toBeInTheDocument()
    expect(screen.queryByText("USDC")).not.toBeInTheDocument()
    expect(screen.queryByText("BTC")).not.toBeInTheDocument()
  })

  it("searches by token symbol, case-insensitively", async () => {
    const user = userEvent.setup()
    renderMyLocks()

    await user.type(screen.getByPlaceholderText(/search by token symbol or lock id/i), "usdc")

    expect(screen.getByText("USDC")).toBeInTheDocument()
    expect(screen.queryByText("XLM")).not.toBeInTheDocument()
    expect(screen.queryByText("BTC")).not.toBeInTheDocument()
  })

  it("searches by lock id", async () => {
    const user = userEvent.setup()
    renderMyLocks()

    await user.type(screen.getByPlaceholderText(/search by token symbol or lock id/i), "3")

    expect(screen.getByText("BTC")).toBeInTheDocument()
    expect(screen.queryByText("USDC")).not.toBeInTheDocument()
    expect(screen.queryByText("XLM")).not.toBeInTheDocument()
  })

  it("combines the search box with the status filter", async () => {
    const user = userEvent.setup()
    renderMyLocks()

    await user.selectOptions(screen.getByLabelText(/filter by status/i), "locked")
    await user.type(screen.getByPlaceholderText(/search by token symbol or lock id/i), "xlm")

    // XLM is "unlockable", not "locked" — the combined filter should match nothing.
    expect(screen.queryByText("USDC")).not.toBeInTheDocument()
    expect(screen.queryByText("XLM")).not.toBeInTheDocument()
    expect(screen.getByText(/no locks match your filters/i)).toBeInTheDocument()
  })

  it("sorts by unlock date ascending by default", () => {
    renderMyLocks()
    // BTC unlocks soonest (+50_000), then XLM (+100_000), then USDC (+300_000).
    expect(visibleLockOrder()).toEqual(["Lock #3", "Lock #2", "Lock #1"])
  })

  it("sorts by amount descending", async () => {
    const user = userEvent.setup()
    renderMyLocks()

    await user.selectOptions(screen.getByLabelText(/sort locks/i), "amount")

    // XLM (500) > USDC (100) > BTC (50).
    expect(visibleLockOrder()).toEqual(["Lock #2", "Lock #1", "Lock #3"])
  })

  it("sorts by created-at descending (most recent first)", async () => {
    const user = userEvent.setup()
    renderMyLocks()

    await user.selectOptions(screen.getByLabelText(/sort locks/i), "createdAt")

    // BTC created last (-1_000), then XLM (-2_000), then USDC (-3_000).
    expect(visibleLockOrder()).toEqual(["Lock #3", "Lock #2", "Lock #1"])
  })
})
