import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PageSkeleton } from "@/components/ui/PageSkeleton"

describe("PageSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<PageSkeleton />)

    expect(container.firstChild).toBeInTheDocument()
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
  })

  it("exposes a busy loading status to assistive tech", () => {
    render(<PageSkeleton />)

    const status = screen.getByRole("status")
    expect(status).toHaveAttribute("aria-busy", "true")
    expect(status).toHaveTextContent("Loading…")
  })

  it("hides the decorative placeholder blocks from assistive tech", () => {
    const { container } = render(<PageSkeleton />)

    const placeholders = container.querySelector("[aria-hidden]")
    expect(placeholders).not.toBeNull()
    expect(placeholders).toContainElement(container.querySelector(".animate-pulse") as HTMLElement)
  })
})
