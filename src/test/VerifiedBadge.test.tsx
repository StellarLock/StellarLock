import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { VerifiedBadge } from "@/components/ui/VerifiedBadge"

describe("VerifiedBadge component", () => {
  // ── null ──────────────────────────────────────────────────────────────────

  it("renders nothing when verified is null", () => {
    const { container } = render(<VerifiedBadge verified={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  // ── verified = true ───────────────────────────────────────────────────────

  it("renders the 'Verified' label when verified is true", () => {
    render(<VerifiedBadge verified={true} />)
    expect(screen.getByText("Verified")).toBeInTheDocument()
  })

  it("does not render the 'Unverified' label when verified is true", () => {
    render(<VerifiedBadge verified={true} />)
    expect(screen.queryByText("Unverified")).not.toBeInTheDocument()
  })

  it("includes the correct title tooltip for a verified token", () => {
    render(<VerifiedBadge verified={true} />)
    const badge = screen.getByText("Verified").closest("span")!
    expect(badge).toHaveAttribute("title", expect.stringContaining("community allowlist"))
  })

  it("applies green styling for a verified badge", () => {
    render(<VerifiedBadge verified={true} />)
    const badge = screen.getByText("Verified").closest("span")!
    expect(badge.className).toContain("green")
  })

  // ── verified = false, showUnverified = true (default) ─────────────────────

  it("renders the 'Unverified' label when verified is false and showUnverified is true (default)", () => {
    render(<VerifiedBadge verified={false} />)
    expect(screen.getByText("Unverified")).toBeInTheDocument()
  })

  it("does not render the 'Verified' label when verified is false", () => {
    render(<VerifiedBadge verified={false} />)
    expect(screen.queryByText("Verified")).not.toBeInTheDocument()
  })

  it("includes the correct title tooltip for an unverified token", () => {
    render(<VerifiedBadge verified={false} />)
    const badge = screen.getByText("Unverified").closest("span")!
    expect(badge).toHaveAttribute("title", expect.stringContaining("Proceed with caution"))
  })

  it("applies yellow/warning styling for an unverified badge", () => {
    render(<VerifiedBadge verified={false} />)
    const badge = screen.getByText("Unverified").closest("span")!
    expect(badge.className).toContain("yellow")
  })

  // ── verified = false, showUnverified = false ──────────────────────────────

  it("renders nothing when verified is false and showUnverified is false", () => {
    const { container } = render(<VerifiedBadge verified={false} showUnverified={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  // ── className prop ────────────────────────────────────────────────────────

  it("forwards the className prop to the verified badge element", () => {
    render(<VerifiedBadge verified={true} className="my-extra-class" />)
    const badge = screen.getByText("Verified").closest("span")!
    expect(badge.className).toContain("my-extra-class")
  })

  it("forwards the className prop to the unverified badge element", () => {
    render(<VerifiedBadge verified={false} className="another-class" />)
    const badge = screen.getByText("Unverified").closest("span")!
    expect(badge.className).toContain("another-class")
  })
})
