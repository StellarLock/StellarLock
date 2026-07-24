import { test, expect, type Page } from "@playwright/test"

const themes = ["light", "dark"] as const

async function setTheme(page: Page, theme: (typeof themes)[number]) {
  await page.addInitScript((t) => {
    window.localStorage.setItem("theme", t)
  }, theme)
}

for (const theme of themes) {
  test.describe(`visual regression — ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme)
    })

    test(`landing page (${theme})`, async ({ page }) => {
      await page.goto("/")
      await page.waitForSelector("text=StellarLock")
      await expect(page).toHaveScreenshot(`landing-${theme}.png`, { fullPage: true })
    })

    test(`create lock page (${theme})`, async ({ page }) => {
      await page.goto("/app/create")
      await page.waitForSelector("text=Create a lock")
      await expect(page).toHaveScreenshot(`create-lock-${theme}.png`, { fullPage: true })
    })

    test(`lock detail page — not found state (${theme})`, async ({ page }) => {
      await page.goto("/app/lock/999999999")
      await page.waitForSelector("text=Lock not found")
      await expect(page).toHaveScreenshot(`lock-detail-not-found-${theme}.png`, { fullPage: true })
    })

    test(`explorer page — not found state (${theme})`, async ({ page }) => {
      await page.goto("/explore/DOES-NOT-EXIST")
      await page.waitForSelector("text=No locks found")
      await expect(page).toHaveScreenshot(`explorer-not-found-${theme}.png`, { fullPage: true })
    })
  })
}
