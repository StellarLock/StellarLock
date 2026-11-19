/**
 * e2e tests for the 404 (catch-all) route.
 *
 * The React Router `<Route path="*" element={<NotFound />} />` is the catch-all
 * that renders the NotFound page component. These tests verify that any
 * unrecognised path reaches that component and renders the expected UI.
 */

import { test, expect } from '@playwright/test'
import { NotFoundPage } from './pages/not-found.page'

test.describe('404 — catch-all route', () => {
  test('renders the 404 heading for an unknown path', async ({ page }) => {
    const notFound = new NotFoundPage(page)
    await notFound.goto('/this-page-does-not-exist')

    await expect(notFound.heading404()).toBeVisible()
    await expect(notFound.subHeading()).toBeVisible()
  })

  test('displays the attempted path in the page', async ({ page }) => {
    const notFound = new NotFoundPage(page)
    const unknownPath = '/totally/unknown/route'
    await notFound.goto(unknownPath)

    // The component renders the attempted pathname in a monospace block
    // whenever it differs from "/".
    await expect(notFound.attemptedPath(unknownPath)).toBeVisible()
  })

  test('shows "Back to Home" and "Explore Locks" CTAs', async ({ page }) => {
    const notFound = new NotFoundPage(page)
    await notFound.goto('/no-such-page')

    await expect(notFound.backToHomeLink()).toBeVisible()
    await expect(notFound.exploreLocksLink()).toBeVisible()
  })

  test('"Back to Home" link navigates to the landing page', async ({ page }) => {
    const notFound = new NotFoundPage(page)
    await notFound.goto('/no-such-page')

    await notFound.backToHomeLink().click()
    await expect(page).toHaveURL('/')
  })

  test('"Explore Locks" link navigates to the explore page', async ({ page }) => {
    const notFound = new NotFoundPage(page)
    await notFound.goto('/no-such-page')

    await notFound.exploreLocksLink().click()
    await expect(page).toHaveURL(/\/explore/)
  })

  test('shows the "Need Help?" section', async ({ page }) => {
    const notFound = new NotFoundPage(page)
    await notFound.goto('/no-such-page')

    await expect(notFound.helpSection()).toBeVisible()
  })

  test('renders on deeply nested unknown paths', async ({ page }) => {
    const notFound = new NotFoundPage(page)
    await notFound.goto('/app/lock/does/not/exist/at/all')

    await expect(notFound.heading404()).toBeVisible()
  })

  test('has the correct page title', async ({ page }) => {
    const notFound = new NotFoundPage(page)
    await notFound.goto('/no-such-page')

    await expect(page).toHaveTitle(/page not found/i)
  })
})
