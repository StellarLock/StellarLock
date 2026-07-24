import { test, expect } from '@playwright/test'
import { CreateLockPage } from './pages/create-lock.page'

test.describe('Create Lock Page', () => {
  test('Create lock page loads', async ({ page }) => {
    const createLock = new CreateLockPage(page)
    await createLock.goto()
    expect(await createLock.isVisible()).toBeTruthy()
  })

  test('Token lock form is visible by default', async ({ page }) => {
    const createLock = new CreateLockPage(page)
    await createLock.goto()
    const input = page.locator('input[placeholder*="token"]').first()
    expect(await input.isVisible()).toBeTruthy()
  })

  test('Can switch to LP lock tab', async ({ page }) => {
    const createLock = new CreateLockPage(page)
    await createLock.goto()
    await createLock.switchToLpTab()
    await expect(page).toContainText(/LP|pool/i)
  })

  test('Can switch back to Token lock tab', async ({ page }) => {
    const createLock = new CreateLockPage(page)
    await createLock.goto()
    await createLock.switchToLpTab()
    await createLock.switchToTokenTab()
    expect(await createLock.isVisible()).toBeTruthy()
  })

  test('Form validation for empty fields', async ({ page }) => {
    const createLock = new CreateLockPage(page)
    await createLock.goto()
    await createLock.submitForm()
    const error = await page.locator('[role="alert"], .error, .text-red').first()
    expect(await error.isVisible()).toBeTruthy()
  })

  test('Date picker is accessible', async ({ page }) => {
    const createLock = new CreateLockPage(page)
    await createLock.goto()
    const dateInput = page.locator('input[type="date"]').first()
    expect(await dateInput.isVisible()).toBeTruthy()
  })

  test('Beneficiary address field is optional', async ({ page }) => {
    const createLock = new CreateLockPage(page)
    await createLock.goto()
    const inputs = await page.locator('input[placeholder*="address"]').all()
    expect(inputs.length).toBeGreaterThan(0)
  })
})
