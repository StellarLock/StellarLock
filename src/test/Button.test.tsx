import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button } from "@/components/ui/Button"

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument()
  })

  it("applies the primary variant by default", () => {
    render(<Button>Primary</Button>)
    const btn = screen.getByRole("button", { name: "Primary" })
    expect(btn.className).toContain("bg-primary")
  })

  it("applies the secondary variant", () => {
    render(<Button variant="secondary">Secondary</Button>)
    const btn = screen.getByRole("button", { name: "Secondary" })
    expect(btn.className).toContain("bg-secondary")
  })

  it("applies the outline variant", () => {
    render(<Button variant="outline">Outline</Button>)
    const btn = screen.getByRole("button", { name: "Outline" })
    expect(btn.className).toContain("border-border")
  })

  it("applies the ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>)
    const btn = screen.getByRole("button", { name: "Ghost" })
    expect(btn.className).toContain("bg-transparent")
  })

  it("applies the destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>)
    const btn = screen.getByRole("button", { name: "Delete" })
    expect(btn.className).toContain("bg-destructive")
  })

  it("applies the sm size", () => {
    render(<Button size="sm">Small</Button>)
    const btn = screen.getByRole("button", { name: "Small" })
    expect(btn.className).toContain("h-9")
  })

  it("applies the lg size", () => {
    render(<Button size="lg">Large</Button>)
    const btn = screen.getByRole("button", { name: "Large" })
    expect(btn.className).toContain("h-12")
  })

  it("applies the icon size", () => {
    render(<Button size="icon" aria-label="icon button" />)
    const btn = screen.getByRole("button", { name: "icon button" })
    expect(btn.className).toContain("h-10 w-10")
  })

  it("is disabled when the disabled prop is set", () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled()
  })

  it("shows a loading spinner and disables the button when loading", () => {
    const { container } = render(<Button loading>Save</Button>)
    const btn = screen.getByRole("button", { name: "Save" })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute("aria-busy", "true")
    // Lucide Loader2 renders an svg
    expect(container.querySelector("svg")).toBeInTheDocument()
  })

  it("does not show a loading spinner when not loading", () => {
    const { container } = render(<Button>Save</Button>)
    expect(container.querySelector("svg")).not.toBeInTheDocument()
  })

  it("forwards extra class names", () => {
    render(<Button className="my-custom-class">Styled</Button>)
    expect(screen.getByRole("button", { name: "Styled" }).className).toContain("my-custom-class")
  })

  it("fires the onClick handler when clicked", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    await user.click(screen.getByRole("button", { name: "Click" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("does not fire onClick when disabled", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    )
    await user.click(screen.getByRole("button", { name: "Disabled" }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
