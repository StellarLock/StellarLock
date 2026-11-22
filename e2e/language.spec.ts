import { test, expect } from "@playwright/test"

test.describe("Language switching", () => {
  test("switching to Spanish translates the navbar label and page title", async ({ page }) => {
    // The Analytics page is one of the few whose <title> is driven by i18n
    // (`analytics.title`), so the document title visibly changes with the active
    // locale. Stub the indexer so the page renders its zeroed fallback state.
    await page.route("**/api/indexer-stats", (route) => route.fulfill({ status: 503 }))

    await page.goto("/app/analytics")

    // The navbar label and <title> render in the default English locale.
    await expect(page.getByRole("link", { name: "Create Lock" })).toBeVisible()
    await expect(page).toHaveTitle("Analytics | StellarLock")

    // Open the language selector (Globe button) and switch to Spanish.
    await page.getByRole("button", { name: "Select language" }).click()
    await page.getByRole("menuitem", { name: "Español" }).click()

    // The navbar label and document title now render in Spanish.
    await expect(page.getByRole("link", { name: "Crear bloqueo" })).toBeVisible()
    await expect(page).toHaveTitle("Analítica | StellarLock")
  })
})
