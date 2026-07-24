import { Page } from '@playwright/test'

export class LandingPage {
  constructor(public page: Page) {}

  async goto() {
    await this.page.goto('/')
  }

  async clickCreateLock() {
    await this.page.click('text=Create Lock')
  }

  async clickExplorer() {
    await this.page.click('text=Explore Locks')
  }

  async clickDiscover() {
    await this.page.click('text=Discover')
  }

  async isVisible() {
    return await this.page.locator('h1:has-text("Lock your tokens")').isVisible()
  }
}
