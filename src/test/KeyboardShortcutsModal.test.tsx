import { describe, it, expect, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { KeyboardShortcutsModal } from "@/components/ui/KeyboardShortcutsModal"

describe("KeyboardShortcutsModal", () => {
  // -------------------------------------------------------------------------
  // Closed state
  // -------------------------------------------------------------------------

  it("renders nothing when open=false", () => {
    render(<KeyboardShortcutsModal open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Open state — structure & accessibility
  // -------------------------------------------------------------------------

  it("renders a dialog with correct ARIA attributes when open=true", () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAttribute("aria-label", "Keyboard shortcuts")
  })

  it("displays the 'Keyboard shortcuts' heading", () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    expect(screen.getByRole("heading", { name: /keyboard shortcuts/i })).toBeInTheDocument()
  })

  it("renders a close button with accessible label", () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Shortcut list content
  // -------------------------------------------------------------------------

  it("shows the 'Open quick search' shortcut", () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    expect(screen.getByText(/open quick search/i)).toBeInTheDocument()
  })

  it("shows the 'Navigate to Create Lock' shortcut", () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    expect(screen.getByText(/navigate to create lock/i)).toBeInTheDocument()
  })

  it("shows the 'Navigate to My Locks' shortcut", () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    expect(screen.getByText(/navigate to my locks/i)).toBeInTheDocument()
  })

  it("shows the 'Navigate to Explorer' shortcut", () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    expect(screen.getByText(/navigate to explorer/i)).toBeInTheDocument()
  })

  it("shows the 'Close modals' shortcut with the Esc key", () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    expect(screen.getByText(/close modals/i)).toBeInTheDocument()
    expect(screen.getByText("Esc")).toBeInTheDocument()
  })

  it("shows the 'Show this help' shortcut with the ? key", () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    expect(screen.getByText(/show this help/i)).toBeInTheDocument()
    expect(screen.getByText("?")).toBeInTheDocument()
  })

  it("renders all six shortcut rows", () => {
    render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(6)
  })

  it("renders <kbd> elements for each key combination", () => {
    const { container } = render(<KeyboardShortcutsModal open={true} onClose={vi.fn()} />)
    const kbdElements = container.querySelectorAll("kbd")
    // At minimum one per shortcut (6 rows, some have 2 keys)
    expect(kbdElements.length).toBeGreaterThanOrEqual(6)
  })

  // -------------------------------------------------------------------------
  // Interactions — close button
  // -------------------------------------------------------------------------

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<KeyboardShortcutsModal open={true} onClose={onClose} />)
    await user.click(screen.getByRole("button", { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // Interactions — backdrop click
  // -------------------------------------------------------------------------

  it("calls onClose when the backdrop overlay is clicked", async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<KeyboardShortcutsModal open={true} onClose={onClose} />)
    const dialog = screen.getByRole("dialog")
    await user.click(dialog)
    expect(onClose).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  // Interactions — Escape key
  // -------------------------------------------------------------------------

  it("calls onClose when the Escape key is pressed", async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<KeyboardShortcutsModal open={true} onClose={onClose} />)
    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledOnce()
  })
})
