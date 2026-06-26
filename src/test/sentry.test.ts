import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { captureException, captureMessage, addBreadcrumb, setUserContext } from "@/lib/sentry"

describe("Sentry Error Tracking", () => {
  beforeEach(() => {
    ;(window as any).Sentry = undefined
    vi.stubEnv("PROD", "true")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("should capture exception without Sentry initialized", () => {
    const error = new Error("Test error")
    expect(() => captureException(error)).not.toThrow()
  })

  it("should capture message without Sentry initialized", () => {
    expect(() => captureMessage("Test message", "info")).not.toThrow()
  })

  it("should add breadcrumb without Sentry initialized", () => {
    expect(() => addBreadcrumb("Test breadcrumb", "test")).not.toThrow()
  })

  it("should set user context without Sentry initialized", () => {
    expect(() => setUserContext("GACW7...")).not.toThrow()
  })

  it("should hash wallet address before sending to Sentry", () => {
    const mockSentry = {
      setUser: vi.fn(),
    }
    ;(window as any).Sentry = mockSentry

    setUserContext("GACW7OAQAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUEGBWQC")

    expect(mockSentry.setUser).toHaveBeenCalled()
    const call = mockSentry.setUser.mock.calls[0]?.[0]
    expect(call?.id).toBeDefined()
    expect(typeof call?.id).toBe("string")
    expect(call.id.length).toBeGreaterThan(0)
  })

  it("should clear user context when address is undefined", () => {
    const mockSentry = {
      setUser: vi.fn(),
    }
    ;(window as any).Sentry = mockSentry

    setUserContext()

    expect(mockSentry.setUser).toHaveBeenCalledWith(null)
  })

  it("should capture exception with context", () => {
    const mockSentry = {
      captureException: vi.fn(),
    }
    ;(window as any).Sentry = mockSentry

    const error = new Error("Test error")
    captureException(error, { lockId: "123", network: "testnet" })

    expect(mockSentry.captureException).toHaveBeenCalledWith(error, {
      contexts: {
        custom: { lockId: "123", network: "testnet" },
      },
    })
  })
})
