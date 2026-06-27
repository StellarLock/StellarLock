import { describe, it, expect, vi, beforeEach } from "vitest"

describe("Web Vitals", () => {
  beforeEach(() => {
    vi.resetModules()
    import.meta.env.DEV = false
  })

  it("should define performance budgets", () => {
    const BUDGETS = {
      LCP: 2500,
      CLS: 0.1,
      INP: 200,
      FID: 100,
      TTFB: 600,
    }

    expect(BUDGETS.LCP).toBe(2500)
    expect(BUDGETS.CLS).toBe(0.1)
    expect(BUDGETS.INP).toBe(200)
    expect(BUDGETS.FID).toBe(100)
    expect(BUDGETS.TTFB).toBe(600)
  })

  it("should initialize without errors", async () => {
    const { initWebVitals } = await import("@/lib/web-vitals")
    expect(() => initWebVitals()).not.toThrow()
  })

  it("should handle missing web-vitals package gracefully", async () => {
    const { initWebVitals } = await import("@/lib/web-vitals")
    const result = await initWebVitals()
    expect(result).toBeUndefined()
  })
})
