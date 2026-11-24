import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TxProgressSteps } from "@/components/ui/TxProgressSteps"

const ALL_STEPS = [
  "Simulating transaction…",
  "Please sign in your wallet…",
  "Submitting to network…",
  "Waiting for confirmation…",
]

describe("TxProgressSteps component", () => {
  it("renders nothing when phase is 'idle'", () => {
    const { container } = render(<TxProgressSteps phase="idle" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders all four step labels for any active phase", () => {
    render(<TxProgressSteps phase="simulating" />)

    for (const label of ALL_STEPS) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it("marks the first step as active when phase is 'simulating'", () => {
    const { container } = render(<TxProgressSteps phase="simulating" />)

    // The status region is present
    const status = container.querySelector('[role="status"]')
    expect(status).toBeInTheDocument()
    expect(status).toHaveAttribute("aria-live", "polite")

    // Active step has font-medium applied; prior steps have text-muted-foreground
    const steps = container.querySelectorAll(".flex.items-center.gap-2")
    expect(steps[0].className).toContain("font-medium")
    expect(steps[1].className).not.toContain("font-medium")
    expect(steps[2].className).not.toContain("font-medium")
    expect(steps[3].className).not.toContain("font-medium")
  })

  it("marks the second step as active and the first as done when phase is 'signing'", () => {
    const { container } = render(<TxProgressSteps phase="signing" />)

    const steps = container.querySelectorAll(".flex.items-center.gap-2")
    // Step 0 — done (muted)
    expect(steps[0].className).toContain("text-muted-foreground")
    expect(steps[0].className).not.toContain("font-medium")
    // Step 1 — active
    expect(steps[1].className).toContain("font-medium")
    // Steps 2 & 3 — pending (not active, not done)
    expect(steps[2].className).not.toContain("font-medium")
    expect(steps[3].className).not.toContain("font-medium")
  })

  it("marks three steps as done and the last as active when phase is 'confirming'", () => {
    const { container } = render(<TxProgressSteps phase="confirming" />)

    const steps = container.querySelectorAll(".flex.items-center.gap-2")
    expect(steps[0].className).toContain("text-muted-foreground")
    expect(steps[1].className).toContain("text-muted-foreground")
    expect(steps[2].className).toContain("text-muted-foreground")
    expect(steps[3].className).toContain("font-medium")
  })

  it("shows the spinning loader icon only for the active step", () => {
    const { container } = render(<TxProgressSteps phase="submitting" />)

    // Only one animated spinner should exist
    const spinners = container.querySelectorAll(".animate-spin")
    expect(spinners).toHaveLength(1)

    // The spinner belongs to step index 2 ("submitting")
    const steps = container.querySelectorAll(".flex.items-center.gap-2")
    expect(steps[2].querySelector(".animate-spin")).toBeInTheDocument()
  })

  it("has accessible status role and aria-live on the wrapper", () => {
    render(<TxProgressSteps phase="simulating" />)

    const region = screen.getByRole("status")
    expect(region).toBeInTheDocument()
    expect(region).toHaveAttribute("aria-live", "polite")
  })

  it("re-renders correctly when the phase changes across multiple steps", () => {
    const { rerender, container } = render(<TxProgressSteps phase="simulating" />)
    let steps = container.querySelectorAll(".flex.items-center.gap-2")
    expect(steps[0].className).toContain("font-medium")

    rerender(<TxProgressSteps phase="signing" />)
    steps = container.querySelectorAll(".flex.items-center.gap-2")
    expect(steps[1].className).toContain("font-medium")

    rerender(<TxProgressSteps phase="confirming" />)
    steps = container.querySelectorAll(".flex.items-center.gap-2")
    expect(steps[3].className).toContain("font-medium")
  })

  it("returns null again when phase switches back to idle after being active", () => {
    const { rerender, container } = render(<TxProgressSteps phase="simulating" />)
    expect(container).not.toBeEmptyDOMElement()

    rerender(<TxProgressSteps phase="idle" />)
    expect(container).toBeEmptyDOMElement()
  })
})
