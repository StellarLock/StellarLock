import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { captureException, captureMessage, addBreadcrumb, setUserContext } from "@/lib/sentry"

describe("Sentry Error Tracking", () => {
  beforeEach(() => {
    window.Sentry = undefined
    vi.stubEnv("PROD", true)
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

  it("should set user context without Sentry initialized", async () => {
    await expect(setUserContext("GACW7...")).resolves.not.toThrow()
  })

  it("should hash wallet address before sending to Sentry", async () => {
    const mockSentry = {
      setUser: vi.fn(),
    }
    window.Sentry = mockSentry as unknown as typeof window.Sentry

    await setUserContext("GACW7OAQAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUEGBWQC")

    expect(mockSentry.setUser).toHaveBeenCalled()
    const call = mockSentry.setUser.mock.calls[0]?.[0] as { id: string }
    expect(call?.id).toBeDefined()
    expect(typeof call?.id).toBe("string")
    // SHA-256 hex digest is always 64 characters
    expect(call.id).toHaveLength(64)
    // Must not be a plain hex-encoding of the address bytes (trivially reversible)
    expect(call.id).not.toBe(
      Array.from(new TextEncoder().encode("GACW7OAQAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUEGBWQC"))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    )
  })

  it("should clear user context when address is undefined", async () => {
    const mockSentry = {
      setUser: vi.fn(),
    }
    window.Sentry = mockSentry as unknown as typeof window.Sentry

    await setUserContext()

    expect(mockSentry.setUser).toHaveBeenCalledWith(null)
  })

  it("should capture exception with context", () => {
    const mockSentry = {
      captureException: vi.fn(),
    }
    window.Sentry = mockSentry as unknown as typeof window.Sentry

    const error = new Error("Test error")
    captureException(error, { lockId: "123", network: "testnet" })

    expect(mockSentry.captureException).toHaveBeenCalledWith(error, {
      contexts: {
        custom: { lockId: "123", network: "testnet" },
      },
    })
  })
})
