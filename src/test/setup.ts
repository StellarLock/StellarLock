import { expect, afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import "vitest-axe/extend-expect"
import * as axeMatchers from "vitest-axe/matchers"

// Extend expect with axe a11y matchers (toHaveNoViolations)
expect.extend(axeMatchers)

// Cleanup after each test
afterEach(() => {
  cleanup()
  if (global.localStorage) {
    global.localStorage.clear()
  }
})

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
