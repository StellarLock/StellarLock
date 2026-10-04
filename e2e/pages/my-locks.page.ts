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

  async filterByStatus(status: "all" | "locked" | "unlockable" | "withdrawn") {
    await this.page.getByLabel("Filter by status").selectOption(status)
  }

  async filterByType(type: "all" | "token" | "lp") {
    await this.page.getByLabel("Filter by type").selectOption(type)
  }

  async getLockCards() {
    return await this.page.locator('a[href^="/app/lock/"]').count()
  }

  async clickFirstLock() {
    await this.page.locator('a[href^="/app/lock/"]').first().click()
  }

  emptyState() {
    return this.page.getByRole("heading", { level: 3, name: "No locks here yet" })
  }

  loadingSkeleton() {
    return this.page.locator('[class*="animate-pulse"]').first()
  }
}
