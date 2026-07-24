import { describe, it, expect, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useAsync } from "../hooks/useAsync"

describe("useAsync hook integration", () => {
  it("handles a successful fetch cycle cleanly", async () => {
    let resolvePromise: (value: string) => void = () => {}
    const delayPromise = new Promise<string>((resolve) => {
      resolvePromise = resolve
    })

    const fetchMock = vi.fn().mockReturnValue(delayPromise)
    const { result } = renderHook(() => useAsync(fetchMock, []))

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBe(null)

    resolvePromise("success_data")

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toBe("success_data")
    expect(result.current.error).toBe(null)
  })
})
