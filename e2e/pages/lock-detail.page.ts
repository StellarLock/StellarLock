import { Page } from '@playwright/test'

export class LockDetailPage {
  constructor(public page: Page) {}

  async goto(lockId: string) {
    await this.page.goto(`/app/lock/${lockId}`)
  }

  async waitForLockInfo() {
    await this.page.locator('h1').first().waitFor()
  }

  async getLockId() {
    return await this.page.locator('text=/Lock #\d+/').textContent()
  }

  async getUnlockDate() {
    return await this.page.locator('text=/Unlocks/').textContent()
  }

  async clickWithdraw() {
    await this.page.click('button:has-text("Withdraw")')
  }

  async clickExtend() {
    await this.page.click('button:has-text("Extend")')
  }

  async isLoading() {
    return await this.page.locator('[class*="SkeletonLockDetail"]').isVisible()
  }

  async getStatus() {
    return await this.page.locator('[class*="StatusBadge"]').textContent()
  }
}
