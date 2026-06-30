import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createLogger, setLogLevel } from "@/lib/logger"

describe("createLogger", () => {
  beforeEach(() => setLogLevel("debug"))

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("emits debug messages when level is debug", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const log = createLogger("TestComponent")
    log.debug("hello")
    expect(spy).toHaveBeenCalled()
  })

  it("suppresses debug when level is warn", () => {
    setLogLevel("warn")
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const log = createLogger("TestComponent")
    log.debug("suppressed")
    expect(spy).not.toHaveBeenCalled()
  })

  it("emits warn messages when level is warn", () => {
    setLogLevel("warn")
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const log = createLogger("TestComponent")
    log.warn("a warning")
    expect(spy).toHaveBeenCalled()
  })

  it("emits error regardless of level", () => {
    setLogLevel("error")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const log = createLogger("TestComponent")
    log.error("fatal error")
    expect(spy).toHaveBeenCalled()
  })

  it("includes component name in output", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const log = createLogger("MyModule")
    log.debug("test")
    const args = spy.mock.calls[0]
    expect(args.some((a: unknown) => typeof a === "string" && a.includes("MyModule"))).toBe(true)
  })

  it("passes structured data as second argument", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const log = createLogger("TestComponent")
    const data = { key: "value" }
    log.debug("msg", data)
    const args = spy.mock.calls[0]
    expect(args).toContain(data)
  })
})
