import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, render, act } from "@testing-library/react"
import { AnnouncerProvider, useAnnouncer } from "@/hooks/useAnnouncer"
import type { ReactNode } from "react"

function wrapper({ children }: { children: ReactNode }) {
  return <AnnouncerProvider>{children}</AnnouncerProvider>
}

describe("useAnnouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns a no-op default when used outside of an AnnouncerProvider", () => {
    const { result } = renderHook(() => useAnnouncer())

    expect(result.current.message).toBe("")
    expect(() => result.current.announce("hello")).not.toThrow()
  })

  it("starts with an empty message inside a provider", () => {
    const { result } = renderHook(() => useAnnouncer(), { wrapper })
    expect(result.current.message).toBe("")
  })

  it("updates message with the announced text (polite priority)", () => {
    const { result } = renderHook(() => useAnnouncer(), { wrapper })

    act(() => {
      result.current.announce("Lock created successfully.")
    })
    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(result.current.message).toBe("Lock created successfully.")
  })

  it("does not surface assertive announcements through the `message` value", () => {
    const { result } = renderHook(() => useAnnouncer(), { wrapper })

    act(() => {
      result.current.announce("Transaction failed.", "assertive")
    })
    act(() => {
      vi.advanceTimersByTime(50)
    })

    // `message` only tracks the polite region; assertive text goes to the alert region instead.
    expect(result.current.message).toBe("")
  })

  it("renders the announced text into the polite aria-live region in the DOM", () => {
    function Consumer() {
      const { announce } = useAnnouncer()
      return <button onClick={() => announce("Withdrawal complete.")}>fire</button>
    }

    const { getByRole, container } = render(
      <AnnouncerProvider>
        <Consumer />
      </AnnouncerProvider>,
    )

    act(() => {
      getByRole("button").click()
    })
    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("Withdrawal complete.")
  })

  it("re-announcing the same message clears it first so a screen reader re-reads it", () => {
    const { result } = renderHook(() => useAnnouncer(), { wrapper })

    act(() => {
      result.current.announce("Copied address.")
    })
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(result.current.message).toBe("Copied address.")

    // Announcing the identical message again should momentarily clear it before re-setting.
    act(() => {
      result.current.announce("Copied address.")
    })
    expect(result.current.message).toBe("")

    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(result.current.message).toBe("Copied address.")
  })
})
