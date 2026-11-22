import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatusBadge } from "@/components/ui/StatusBadge"

describe("StatusBadge", () => {
  it("renders the Locked label and primary styling for a locked status", () => {
    render(<StatusBadge status="locked" />)

    const badge = screen.getByText("Locked")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass("bg-primary/15")
  })

  it("renders the Unlockable label and warning styling for an unlockable status", () => {
    render(<StatusBadge status="unlockable" />)

    const badge = screen.getByText("Unlockable")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass("bg-warning/15")
  })

  it("renders the Withdrawn label and outline styling for a withdrawn status", () => {
    render(<StatusBadge status="withdrawn" />)

    const badge = screen.getByText("Withdrawn")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass("border-border")
  })

  // #1084: an indexer-archived withdrawn lock should read differently from a
  // normal withdrawn lock, so viewers understand it's historical data.
  it("renders a distinct archived label when a withdrawn lock is flagged archived", () => {
    render(<StatusBadge status="withdrawn" archived />)

    expect(screen.getByText("Withdrawn (archived)")).toBeInTheDocument()
    expect(screen.queryByText("Withdrawn")).not.toBeInTheDocument()
  })
})
