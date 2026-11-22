import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router-dom"
import i18n from "@/i18n"
import { MyLocks } from "@/pages/MyLocks"
import { mockWallet } from "./mocks"

/**
 * Issue #1083: MyLocks used to call `useMyLocks` *and* `useMyLocksStats`,
 * both of which ran `queryMyLocks(address, 0, ALL_LOCKS_LIMIT)` — 8 RPC
 * simulations plus USD enrichment, twice, on every page load.
 *
 * `useMyLocksStats` has been removed; stats are now derived from the
 * `useMyLocks` result. This test exercises the real `useMyLocks` hook
 * (only `queryMyLocks` itself is mocked) to assert the page issues exactly
 * one `queryMyLocks` call per load.
 */

const queryMyLocksMock = vi.fn().mockResolvedValue({
  created: [],
  received: [],
  totalCreated: 0,
  totalReceived: 0,
})

vi.mock("@/lib/queryLocks", () => ({
  queryMyLocks: (...args: unknown[]) => queryMyLocksMock(...args),
}))

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
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

describe("MyLocks single-fetch regression", () => {
  beforeEach(() => {
    queryMyLocksMock.mockClear()
  })

  it("calls queryMyLocks exactly once per page load", async () => {
    renderMyLocks()

    await waitFor(() => {
      expect(queryMyLocksMock).toHaveBeenCalled()
    })

    expect(queryMyLocksMock).toHaveBeenCalledTimes(1)
  })
})
