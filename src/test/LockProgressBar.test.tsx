import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { LockProgressBar } from "@/components/ui/LockProgressBar"

describe("LockProgressBar", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // Helper to build timestamps relative to a fixed "now"
  // -------------------------------------------------------------------------

  /**
   * Sets up fake timers at `now` and returns createdAt / unlockAt values so
   * that `elapsed / total` equals the desired percentage.
   */
  function makeTimestamps(pct: number) {
    const now = 1_000_000_000_000
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const total = 100_000_000 // 100 s in ms
    const createdAt = now - pct * total
    const unlockAt = createdAt + total
    return { createdAt, unlockAt, now }
  }

  // -------------------------------------------------------------------------
  // Progress bar element
  // -------------------------------------------------------------------------

  it("renders the progress bar track element", () => {
    const { createdAt, unlockAt } = makeTimestamps(0.5)
    const { container } = render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    // outer track has overflow-hidden class
    const track = container.querySelector(".overflow-hidden")
    expect(track).toBeInTheDocument()
  })

  it("sets width to 0% when lock was just created (0% elapsed)", () => {
    const { createdAt, unlockAt } = makeTimestamps(0)
    const { container } = render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    const fill = container.querySelector<HTMLElement>("[style]")
    expect(fill?.style.width).toBe("0%")
  })

  it("sets width to 50% when halfway through the lock period", () => {
    const { createdAt, unlockAt } = makeTimestamps(0.5)
    const { container } = render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    const fill = container.querySelector<HTMLElement>("[style]")
    expect(fill?.style.width).toBe("50%")
  })

  it("caps width at 100% when the unlock time has passed", () => {
    const { createdAt, unlockAt } = makeTimestamps(1.5) // 150% elapsed
    const { container } = render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    const fill = container.querySelector<HTMLElement>("[style]")
    expect(fill?.style.width).toBe("100%")
  })

  // -------------------------------------------------------------------------
  // Label — shown by default (showLabel=true)
  // -------------------------------------------------------------------------

  it("shows '50% elapsed' label by default at 50% progress", () => {
    const { createdAt, unlockAt } = makeTimestamps(0.5)
    render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    expect(screen.getByText("50% elapsed")).toBeInTheDocument()
  })

  it("shows '50% remaining' label by default at 50% progress", () => {
    const { createdAt, unlockAt } = makeTimestamps(0.5)
    render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    expect(screen.getByText("50% remaining")).toBeInTheDocument()
  })

  it("shows '0% elapsed' when no time has passed", () => {
    const { createdAt, unlockAt } = makeTimestamps(0)
    render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    expect(screen.getByText("0% elapsed")).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Done state (pct >= 100%)
  // -------------------------------------------------------------------------

  it("shows 'Ready to withdraw' when unlock time has passed", () => {
    const { createdAt, unlockAt } = makeTimestamps(1.5)
    render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    expect(screen.getByText("Ready to withdraw")).toBeInTheDocument()
  })

  it("shows '100% elapsed' when the lock is done", () => {
    const { createdAt, unlockAt } = makeTimestamps(1.0)
    render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    expect(screen.getByText("100% elapsed")).toBeInTheDocument()
  })

  it("applies bg-success class to the fill when done", () => {
    const { createdAt, unlockAt } = makeTimestamps(1.5)
    const { container } = render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    const fill = container.querySelector(".bg-success")
    expect(fill).toBeInTheDocument()
  })

  it("applies bg-primary class to the fill when not done", () => {
    const { createdAt, unlockAt } = makeTimestamps(0.5)
    const { container } = render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} />)
    const fill = container.querySelector(".bg-primary")
    expect(fill).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // showLabel=false hides the label row
  // -------------------------------------------------------------------------

  it("hides the percentage label when showLabel=false", () => {
    const { createdAt, unlockAt } = makeTimestamps(0.5)
    render(<LockProgressBar createdAt={createdAt} unlockAt={unlockAt} showLabel={false} />)
    expect(screen.queryByText(/elapsed/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // className forwarding
  // -------------------------------------------------------------------------

  it("forwards an additional className to the wrapper element", () => {
    const { createdAt, unlockAt } = makeTimestamps(0.5)
    const { container } = render(
      <LockProgressBar createdAt={createdAt} unlockAt={unlockAt} className="my-extra-class" />,
    )
    expect(container.firstChild).toHaveClass("my-extra-class")
  })
})
