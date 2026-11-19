import { describe, it, expect, vi, beforeEach } from "vitest"

const { checkUrl } = vi.hoisted(() => ({ checkUrl: vi.fn() }))

vi.mock("./_lib/network-health", () => ({
  checkUrl,
  NETWORK_URLS: {
    rpcUrl: "https://rpc.example",
    horizonUrl: "https://horizon.example",
  },
}))

import handler from "./health"

function mockResponse() {
  const json = vi.fn()
  const status = vi.fn(() => ({ json }))
  return { res: { status }, status, json }
}

describe("api/health", () => {
  beforeEach(() => {
    checkUrl.mockReset()
  })

  it("returns 200 and status ok when RPC and Horizon checks pass", async () => {
    checkUrl.mockResolvedValue({ status: "ok", detail: "HTTP 200" })
    const { res, status, json } = mockResponse()

    await handler({}, res)

    expect(checkUrl).toHaveBeenCalledWith("https://rpc.example", "/health")
    expect(checkUrl).toHaveBeenCalledWith("https://horizon.example", "/")
    expect(status).toHaveBeenCalledWith(200)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ok",
        service: "stellarlock-frontend",
        dependencies: { rpc: "ok", horizon: "ok", freighter: "unknown" },
      }),
    )
  })

  it("returns 503 and status degraded when the RPC check fails", async () => {
    checkUrl.mockImplementation(async (baseUrl: string) =>
      baseUrl === "https://rpc.example" ? { status: "down", detail: "timeout" } : { status: "ok", detail: "HTTP 200" },
    )
    const { res, status, json } = mockResponse()

    await handler({}, res)

    expect(status).toHaveBeenCalledWith(503)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "degraded",
        dependencies: { rpc: "down", horizon: "ok", freighter: "unknown" },
        detail: { rpc: "timeout", horizon: "HTTP 200" },
      }),
    )
  })

  it("returns 503 and status degraded when the Horizon check fails", async () => {
    checkUrl.mockImplementation(async (baseUrl: string) =>
      baseUrl === "https://horizon.example"
        ? { status: "degraded", detail: "HTTP 500" }
        : { status: "ok", detail: "HTTP 200" },
    )
    const { res, status, json } = mockResponse()

    await handler({}, res)

    expect(status).toHaveBeenCalledWith(503)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "degraded",
        dependencies: { rpc: "ok", horizon: "degraded", freighter: "unknown" },
      }),
    )
  })
})
