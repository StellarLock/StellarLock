import { test, expect } from "@playwright/test"

test.describe("visual regression — core pages", () => {
  test("landing page", async ({ page }) => {
    await page.goto("/")
    await page.waitForSelector("text=StellarLock")
    await expect(page).toHaveScreenshot("landing.png", { fullPage: true })
  })

  test("create lock page", async ({ page }) => {
    await page.goto("/app/create")
    await page.waitForSelector("text=Create a lock")
    await expect(page).toHaveScreenshot("create-lock.png", { fullPage: true })
  })

  test("lock detail page (not found state)", async ({ page }) => {
    await page.goto("/app/lock/999999999")
    await page.waitForSelector("text=Lock not found")
    await expect(page).toHaveScreenshot("lock-detail-not-found.png", { fullPage: true })
  })

  test("explorer page (not found state)", async ({ page }) => {
    await page.goto("/explore/DOES-NOT-EXIST")
    await page.waitForSelector("text=No locks found")
    await expect(page).toHaveScreenshot("explorer-not-found.png", { fullPage: true })
  })
})
