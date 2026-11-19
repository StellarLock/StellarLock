import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Badge } from "@/components/ui/Badge"

describe("Badge", () => {
  it("applies the default variant classes when no variant is given", () => {
    render(<Badge>Default</Badge>)

    const badge = screen.getByText("Default")
    expect(badge).toHaveClass("rounded-full", "bg-secondary", "text-secondary-foreground")
  })

  it.each([
    ["default", ["bg-secondary", "text-secondary-foreground"]],
    ["primary", ["bg-primary/15", "text-primary", "border-primary/30"]],
    ["success", ["bg-success/15", "text-success", "border-success/30"]],
    ["warning", ["bg-warning/15", "text-warning", "border-warning/30"]],
    ["destructive", ["bg-destructive/15", "text-destructive", "border-destructive/30"]],
    ["outline", ["border", "border-border", "text-muted-foreground"]],
  ] as const)("renders the %s variant with its expected classes", (variant, classes) => {
    render(<Badge variant={variant}>{variant}</Badge>)

    const badge = screen.getByText(variant)
    expect(badge).toHaveClass("inline-flex", "rounded-full", ...classes)
  })

  it("renders its children", () => {
    render(
      <Badge>
        <span>Icon</span> Label
      </Badge>,
    )

    expect(screen.getByText("Icon")).toBeInTheDocument()
    expect(screen.getByText(/Label/)).toBeInTheDocument()
  })

  it("merges a custom className with the variant classes", () => {
    render(
      <Badge variant="success" className="custom-badge">
        Merged
      </Badge>,
    )

    const badge = screen.getByText("Merged")
    expect(badge).toHaveClass("custom-badge", "bg-success/15", "rounded-full")
  })
})
