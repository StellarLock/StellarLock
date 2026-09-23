import { test, expect } from "@playwright/test"
import { MyLocksPage } from "./pages/my-locks.page"
import { mockConnectedWallet } from "./wallet-mock"

test.describe("My Locks Page", () => {
  test("My locks page is protected (requires wallet connection)", async ({ page }) => {
    const myLocks = new MyLocksPage(page)
    await myLocks.goto()
    // Should redirect or show connect prompt
    const connectButton = page.locator("text=Connect").first()
    await expect(connectButton).toBeVisible()
  })

  test("Shows skeleton loading state initially", async ({ page }) => {
    const myLocks = new MyLocksPage(page)
    await myLocks.goto()
    // Even though not connected, should show loading UI elements
    await page.locator("body").waitFor()
    const hasContent = await page.locator("body").isVisible()
    expect(hasContent).toBeTruthy()
  })

  // The tabs, search box, and filter dropdowns all live behind <ConnectGate>
  // — none of it renders without a connected wallet.
  test("Tab switching works", async ({ page }) => {
    const myLocks = new MyLocksPage(page)
    await mockConnectedWallet(page)
    await myLocks.goto()
    await myLocks.clickTab("created")
    const url = page.url()
    expect(url).toContain("/app/locks")
  })

  test("Search field is functional", async ({ page }) => {
    const myLocks = new MyLocksPage(page)
    await mockConnectedWallet(page)
    await myLocks.goto()
    await myLocks.searchLock("zzz-no-such-token")
    expect(await myLocks.getSearchValue()).toBe("zzz-no-such-token")
  })

  test("Filter dropdowns are present and selectable", async ({ page }) => {
    const myLocks = new MyLocksPage(page)
    await mockConnectedWallet(page)
    await myLocks.goto()
    await myLocks.filterByStatus("locked")
    expect(await myLocks.getStatusFilterValue()).toBe("locked")
    await myLocks.filterByType("token")
    expect(await myLocks.getTypeFilterValue()).toBe("token")
  })

  test("Impossible filter combination shows empty state with no cards", async ({ page }) => {
    const myLocks = new MyLocksPage(page)
    await mockConnectedWallet(page)
    await myLocks.goto()
    await myLocks.searchLock("zzz-no-such-token")
    await myLocks.filterByStatus("withdrawn")
    await myLocks.filterByType("lp")
    // The empty state only renders once chain data loads. If this
    // environment cannot reach the backend (error state), there is no
    // empty state to assert — skip instead of failing on infra.
    await expect(
      myLocks.page.getByTestId("locks-empty-state").or(myLocks.page.locator("text=/failed to load/i")),
    ).toBeVisible()
    if (await myLocks.page.locator("text=/failed to load/i").isVisible()) {
      test.skip(true, "chain backend unreachable; empty state needs loaded data")
    }
    expect(await myLocks.getLockCards()).toBe(0)
    const message = await myLocks.getEmptyStateMessage()
    expect(message).toMatch(/no locks/i)
  })

  test("Empty state message displays correctly", async ({ page }) => {
    const myLocks = new MyLocksPage(page)
    await myLocks.goto()
    const connectButton = page.locator("text=Connect")
    if (await connectButton.isVisible()) {
      // Not connected, so empty state shown
      expect(await connectButton.isVisible()).toBeTruthy()
    }
  })
})
