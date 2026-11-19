import { Page } from '@playwright/test'

export class NotFoundPage {
  constructor(public page: Page) {}

  async goto(path = '/this-page-does-not-exist') {
    await this.page.goto(path)
  }

  /** The large "404" heading rendered by the NotFound component. */
  heading404() {
    return this.page.getByRole('heading', { name: '404' })
  }

  /** The descriptive sub-heading ("Page Not Found"). */
  subHeading() {
    return this.page.getByRole('heading', { name: /page not found/i })
  }

  /** The attempted-path monospace code block. */
  attemptedPath(pathname: string) {
    return this.page.locator(`text=${pathname}`)
  }

  /** "Back to Home" CTA link. */
  backToHomeLink() {
    return this.page.getByRole('link', { name: /back to home/i })
  }

  /** "Explore Locks" CTA link. */
  exploreLocksLink() {
    return this.page.getByRole('link', { name: /explore locks/i })
  }

  /** "Need Help?" section. */
  helpSection() {
    return this.page.getByRole('heading', { name: /need help/i })
  }
}
