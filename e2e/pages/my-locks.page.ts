import { Page } from "@playwright/test"

export class MyLocksPage {
  constructor(public page: Page) {}

  async goto() {
    await this.page.goto("/app/locks")
  }

  async clickTab(tab: "created" | "received") {
    await this.page.click(`button:has-text("${tab === "created" ? "Created by Me" : "Beneficiary"}")`)
  }

  async searchLock(query: string) {
    await this.page.fill('input[placeholder*="Search"]', query)
  }

  async getSearchValue() {
    return await this.page.locator('input[placeholder*="Search"]').inputValue()
  }

  async filterByStatus(status: string) {
    await this.page.locator('select[aria-label="Filter by status"]').selectOption(status)
  }

  async getStatusFilterValue() {
    return await this.page.locator('select[aria-label="Filter by status"]').inputValue()
  }

  async filterByType(type: string) {
    const selects = await this.page.locator('select[aria-label="Filter by type"]')
    if ((await selects.count()) > 0) {
      await selects.first().selectOption(type)
    }
  }

  async getTypeFilterValue() {
    return await this.page.locator('select[aria-label="Filter by type"]').inputValue()
  }

  async getLockCards() {
    return await this.page.getByTestId("lock-card").count()
  }

  async getEmptyStateMessage() {
    return await this.page.getByTestId("locks-empty-state").textContent()
  }
}
