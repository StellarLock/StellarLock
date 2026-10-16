import { ReactElement } from "react"
import { expect } from "vitest"
import { render, RenderOptions, screen } from "@testing-library/react"
import { AllTheProviders } from "./AllTheProviders"

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  render(ui, { wrapper: AllTheProviders, ...options })

// AnnouncerProvider always renders its own role="status"/role="alert" live
// regions as siblings after {children}, so container.firstChild is never
// truly null even when the component under test renders nothing. Use this
// instead of `expect(container.firstChild).toBeNull()` with the render()
// exported from this file.
function expectNoRenderedContent(container: HTMLElement) {
  const meaningfulChildren = Array.from(container.children).filter(
    (el) => el.getAttribute("role") !== "status" && el.getAttribute("role") !== "alert",
  )
  expect(meaningfulChildren).toHaveLength(0)
}

// AnnouncerProvider's own role="alert" live region means screen.getByRole
// ("alert") throws "found multiple elements" for any component that also
// renders a role="alert" of its own. The announcer's is always visually
// hidden (sr-only); the component's own alert is meant to be seen, so filter
// on that to get the one the test actually wants.
function getComponentAlert(): HTMLElement {
  const alerts = screen.getAllByRole("alert")
  const real = alerts.find((el) => !el.className.includes("sr-only"))
  if (!real) throw new Error('No non-announcer role="alert" element found')
  return real
}

export * from "@testing-library/react"
export { customRender as render, expectNoRenderedContent, getComponentAlert }
