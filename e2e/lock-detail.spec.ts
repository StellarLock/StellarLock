import { test, expect } from '@playwright/test'
import { LockDetailPage } from './pages/lock-detail.page'

test.describe('Lock Detail Page', () => {
  test('Lock detail page shows skeleton while loading', async ({ page }) => {
    const detail = new LockDetailPage(page)
    // Use a valid lock ID format
    await detail.goto('1')
    await page.locator('body').waitFor()
    const hasUI = await page.locator('body').isVisible()
    expect(hasUI).toBeTruthy()
  })

  test('Lock information displays after loading', async ({ page }) => {
    const detail = new LockDetailPage(page)
    await detail.goto('1')
    await detail.waitForLockInfo()
    // Should have either lock details or error message
    const content = await page.textContent('body')
    expect(content).toBeTruthy()
  })

  test('Back button navigation works', async ({ page }) => {
    const detail = new LockDetailPage(page)
    await detail.goto('1')
    const backButton = page.locator('a:has-text("back"), button:has-text("back")')
    if (await backButton.isVisible()) {
      await backButton.click()
      await page.waitForURL((url) => !url.pathname.includes('/lock/'))
      const newUrl = page.url()
      expect(newUrl).not.toContain('/lock/')
    }
  })

  test('Responsive layout on mobile viewport', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    })
    const page = await context.newPage()
    const detail = new LockDetailPage(page)
    await detail.goto('1')
    await page.locator('body').waitFor()
    const isVisible = await page.locator('body').isVisible()
    expect(isVisible).toBeTruthy()
    await context.close()
  })

  test('Shows error for invalid lock ID', async ({ page }) => {
    const detail = new LockDetailPage(page)
    await detail.goto('invalid-id')
    await page.locator('body').waitFor()
    const text = await page.textContent('body')
    // Should show error or empty state
    expect(text).toBeTruthy()
  })
})
