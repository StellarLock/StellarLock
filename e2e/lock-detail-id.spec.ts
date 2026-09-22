import { expect, test } from "@playwright/test"
import { LockDetailPage } from "./pages/lock-detail.page"

test("getLockId matches Lock #<digits> text", async ({ page }) => {
  // "Lock #d+" is what the old string selector matched after `\d` lost its backslash.
  await page.setContent("<p>Lock #d+</p><p>Lock #123</p>")
  const detail = new LockDetailPage(page)
  expect(await detail.getLockId()).toBe("Lock #123")
})
