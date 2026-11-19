/**
 * Unit tests for src/lib/analytics.ts — #695
 *
 * Analytics must be fully gated on VITE_PLAUSIBLE_DOMAIN: no script and no
 * window.plausible calls without it, and tracking must never throw.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { initAnalytics, trackEvent, trackPageView } from "@/lib/analytics"

type PlausibleWindow = Window & { plausible?: (name: string, opts?: unknown) => void }

function plausibleScripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll<HTMLScriptElement>("script[data-domain]"))
}

function setEnv(domain: string, apiHost = "", integrity = "") {
  vi.stubEnv("VITE_PLAUSIBLE_DOMAIN", domain)
  vi.stubEnv("VITE_PLAUSIBLE_API_HOST", apiHost)
  vi.stubEnv("VITE_PLAUSIBLE_INTEGRITY", integrity)
}

describe("analytics", () => {
  beforeEach(() => {
    setEnv("")
    plausibleScripts().forEach((s) => s.remove())
    delete (window as PlausibleWindow).plausible
  })

  afterEach(() => {
    setEnv("")
    plausibleScripts().forEach((s) => s.remove())
    delete (window as PlausibleWindow).plausible
  })

  describe("initAnalytics()", () => {
    it("does nothing when VITE_PLAUSIBLE_DOMAIN is not set", () => {
      const appendSpy = vi.spyOn(document.head, "appendChild")

      initAnalytics()

      expect(appendSpy).not.toHaveBeenCalled()
      expect(plausibleScripts()).toHaveLength(0)
      appendSpy.mockRestore()
    })

    it("appends the Plausible script with the right src and data-domain", () => {
      setEnv("stellarlock.app")

      initAnalytics()

      const scripts = plausibleScripts()
      expect(scripts).toHaveLength(1)
      const script = scripts[0]
      expect(script.src).toBe("https://plausible.io/js/script.js")
      expect(script.dataset.domain).toBe("stellarlock.app")
      expect(script.dataset.api).toBe("https://plausible.io/api/event")
      expect(script.defer).toBe(true)
      expect(script.crossOrigin).toBe("anonymous")
    })

    it("uses VITE_PLAUSIBLE_API_HOST and VITE_PLAUSIBLE_INTEGRITY when set", () => {
      setEnv("stellarlock.app", "https://stats.example.com", "sha384-abc")

      initAnalytics()

      const script = plausibleScripts()[0]
      expect(script.src).toBe("https://stats.example.com/js/script.js")
      expect(script.dataset.api).toBe("https://stats.example.com/api/event")
      expect(script.integrity).toBe("sha384-abc")
    })
  })

  describe("trackEvent()", () => {
    it("does not call window.plausible when no domain is configured", () => {
      const plausible = vi.fn()
      ;(window as PlausibleWindow).plausible = plausible

      trackEvent("wallet_connect")
      trackPageView()

      expect(plausible).not.toHaveBeenCalled()
    })

    it("never throws when window.plausible is undefined", () => {
      expect(() => trackEvent("wallet_connect")).not.toThrow()

      setEnv("stellarlock.app")
      expect(() => trackEvent("wallet_connect", { a: 1 })).not.toThrow()
      expect(() => trackPageView()).not.toThrow()
    })

    it("swallows errors thrown by window.plausible", () => {
      setEnv("stellarlock.app")
      ;(window as PlausibleWindow).plausible = () => {
        throw new Error("blocked by ad-blocker")
      }

      expect(() => trackEvent("lock_withdraw")).not.toThrow()
    })

    it("forwards the event name and props when a domain is configured", () => {
      setEnv("stellarlock.app")
      const plausible = vi.fn()
      ;(window as PlausibleWindow).plausible = plausible

      trackEvent("lock_create_token", { amount: 10, verified: true })
      trackEvent("wallet_disconnect")

      expect(plausible).toHaveBeenNthCalledWith(1, "lock_create_token", { props: { amount: 10, verified: true } })
      expect(plausible).toHaveBeenNthCalledWith(2, "wallet_disconnect", undefined)
    })

    it("trackPageView() sends a pageview event", () => {
      setEnv("stellarlock.app")
      const plausible = vi.fn()
      ;(window as PlausibleWindow).plausible = plausible

      trackPageView()

      expect(plausible).toHaveBeenCalledWith("pageview", undefined)
    })
  })
})
