import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CopyButton } from "@/components/ui/CopyButton"
import i18n from "@/i18n"

describe("CopyButton", () => {
  const mockWriteText = vi.fn<(data: string) => Promise<void>>()

  const copyLabel = () => i18n.t("common.copy")
  const copiedLabel = () => i18n.t("common.copied")

  // userEvent.setup() attaches its own clipboard stub to `navigator`, so the
  // mock must be installed *after* setup() runs or it gets clobbered.
  // navigator.clipboard is also a getter-only accessor in jsdom, so
  // Object.assign (a plain [[Set]]) throws — this must use defineProperty to
  // replace the accessor with a writable own property.
  function setupUser(options?: Parameters<typeof userEvent.setup>[0]) {
    const user = userEvent.setup(options)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      configurable: true,
      writable: true,
    })
    return user
  }

  beforeEach(() => {
    mockWriteText.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders a button with the translated copy aria-label", () => {
    render(<CopyButton text="hello" />)
    expect(screen.getByRole("button", { name: copyLabel() })).toBeInTheDocument()
  })

  it("calls clipboard.writeText with the provided text on click", async () => {
    const user = setupUser()
    render(<CopyButton text="copy-me" />)
    await user.click(screen.getByRole("button", { name: copyLabel() }))
    expect(mockWriteText).toHaveBeenCalledWith("copy-me")
  })

  it("switches to the translated copied aria-label after a successful copy", async () => {
    const user = setupUser()
    render(<CopyButton text="copy-me" />)
    await user.click(screen.getByRole("button", { name: copyLabel() }))
    expect(screen.getByRole("button", { name: copiedLabel() })).toBeInTheDocument()
  })

  it("reverts the aria-label back to the translated copy label after 1500 ms", async () => {
    vi.useFakeTimers()
    const user = setupUser({ advanceTimers: vi.advanceTimersByTime })
    render(<CopyButton text="copy-me" />)

    await user.click(screen.getByRole("button", { name: copyLabel() }))
    // Flush the microtask queue so the post-await setCopied(true) from
    // handleCopy is applied before we assert — fake timers only control
    // setTimeout/setInterval, not native Promise resolution.
    await act(async () => {})
    expect(screen.getByRole("button", { name: copiedLabel() })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(screen.getByRole("button", { name: copyLabel() })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it("stays in the default state when the clipboard API throws", async () => {
    mockWriteText.mockRejectedValueOnce(new Error("denied"))
    const user = setupUser()
    render(<CopyButton text="copy-me" />)
    await user.click(screen.getByRole("button", { name: copyLabel() }))
    // After a failure the label should stay as-is (no crash, no copied state)
    expect(screen.getByRole("button", { name: copyLabel() })).toBeInTheDocument()
  })

  it("forwards an extra className to the button element", () => {
    render(<CopyButton text="x" className="extra-class" />)
    expect(screen.getByRole("button", { name: copyLabel() }).className).toContain("extra-class")
  })

  it("updates the aria-label when the active language changes", async () => {
    const originalLanguage = i18n.language
    try {
      await act(async () => {
        await i18n.changeLanguage("tr")
      })
      render(<CopyButton text="hello" />)
      expect(screen.getByRole("button", { name: i18n.t("common.copy") })).toBeInTheDocument()
      expect(i18n.t("common.copy")).not.toBe("Copy to clipboard")
    } finally {
      await act(async () => {
        await i18n.changeLanguage(originalLanguage)
      })
    }
  })
})
