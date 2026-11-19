/**
 * Unit tests for indexer-client.ts's fetchJson behaviour — #696
 *
 * fetchJson (exercised through fetchIndexerStats / fetchIndexerLocksForToken)
 * caches successful responses for 10s, aborts after 3s, and returns null on
 * a non-OK response or a thrown/aborted fetch so callers can fall back to
 * direct RPC. The cache lives at module scope, so each test re-imports a
 * fresh copy of the module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/token-metadata", () => ({
  getOnChainTokenMeta: vi.fn(),
}))

type IndexerClient = typeof import("@/lib/indexer-client")

const CACHE_TTL_MS = 10_000
const FETCH_TIMEOUT_MS = 3000

const STATS = {
  totalLocks: 3,
  totalValue: "1000",
  uniqueTokens: 2,
  recentLocks: [],
  upcomingUnlocks: [],
  topTokens: [],
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response
}

function errorResponse(status: number): Response {
  return { ok: false, status, json: () => Promise.resolve({ error: "nope" }) } as unknown as Response
}

describe("indexer-client fetchJson", () => {
  let client: IndexerClient
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    client = await import("@/lib/indexer-client")
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("returns the parsed body on a successful response", async () => {
    fetchMock.mockResolvedValue(okResponse(STATS))

    await expect(client.fetchIndexerStats()).resolves.toEqual(STATS)
    expect(fetchMock).toHaveBeenCalledWith("/api/indexer-stats", expect.objectContaining({ signal: expect.anything() }))
  })

  it("serves repeat calls for the same URL from cache within the TTL", async () => {
    fetchMock.mockResolvedValue(okResponse(STATS))

    const first = await client.fetchIndexerStats()
    vi.advanceTimersByTime(CACHE_TTL_MS - 1)
    const second = await client.fetchIndexerStats()

    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("refetches once the TTL has expired", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(STATS))
    fetchMock.mockResolvedValueOnce(okResponse({ ...STATS, totalLocks: 4 }))

    await client.fetchIndexerStats()
    vi.advanceTimersByTime(CACHE_TTL_MS)
    const refreshed = await client.fetchIndexerStats()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(refreshed?.totalLocks).toBe(4)
  })

  it("caches per URL, so different query params are fetched separately", async () => {
    fetchMock.mockResolvedValue(okResponse({ total: 0, locks: [] }))

    await client.fetchIndexerLocksForToken("CTOKEN", 0, 10)
    await client.fetchIndexerLocksForToken("CTOKEN", 10, 10)
    await client.fetchIndexerLocksForToken("CTOKEN", 0, 10)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/indexer-locks?token=CTOKEN&offset=0&limit=10")
    expect(fetchMock.mock.calls[1][0]).toBe("/api/indexer-locks?token=CTOKEN&offset=10&limit=10")
  })

  it("returns null on a non-OK response", async () => {
    fetchMock.mockResolvedValue(errorResponse(503))

    await expect(client.fetchIndexerStats()).resolves.toBeNull()
  })

  it("does not cache non-OK responses", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500))
    fetchMock.mockResolvedValueOnce(okResponse(STATS))

    await expect(client.fetchIndexerStats()).resolves.toBeNull()
    await expect(client.fetchIndexerStats()).resolves.toEqual(STATS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("returns null instead of throwing when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

    await expect(client.fetchIndexerStats()).resolves.toBeNull()
  })

  it("returns null when the request is aborted by the timeout", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const signal = init?.signal
      return new Promise((_resolve, reject) => {
        const onAbort = () => reject(new DOMException("The operation timed out.", "TimeoutError"))
        if (signal?.aborted) onAbort()
        signal?.addEventListener("abort", onAbort)
        // Fallback so the test never hangs if AbortSignal.timeout ignores fake timers.
        setTimeout(onAbort, FETCH_TIMEOUT_MS)
      })
    })

    const pending = client.fetchIndexerStats()
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS)

    await expect(pending).resolves.toBeNull()
  })

  it("passes a 3s timeout abort signal to fetch", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout")
    fetchMock.mockResolvedValue(okResponse(STATS))

    await client.fetchIndexerStats()

    expect(timeoutSpy).toHaveBeenCalledWith(FETCH_TIMEOUT_MS)
    timeoutSpy.mockRestore()
  })

  it("returns null when the response body is not valid JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as unknown as Response)

    await expect(client.fetchIndexerStats()).resolves.toBeNull()
  })
})
