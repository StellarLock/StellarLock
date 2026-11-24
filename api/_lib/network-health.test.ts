// @vitest-environment node
/**
 * Tests for api/_lib/network-health.ts
 *
 * `checkUrl` makes real HTTP requests via the global `fetch`. That is replaced
 * with a Vitest spy so the tests are fully offline and deterministic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Stub global fetch before importing the module so the module picks up the
// spy at evaluation time (module-level fetch references are resolved once).
// ---------------------------------------------------------------------------
const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

import { checkUrl } from './network-health.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like object that `fetch` would return. */
function makeResponse(status: number, statusText: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
  } as Response
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // ok — 200 response
  // -------------------------------------------------------------------------
  describe('ok status', () => {
    it('returns status "ok" when the endpoint responds with 200', async () => {
      fetchSpy.mockResolvedValue(makeResponse(200, 'OK'))

      const result = await checkUrl('https://soroban-testnet.stellar.org', '/health')

      expect(result.status).toBe('ok')
    })

    it('includes the HTTP status code and text in the detail string', async () => {
      fetchSpy.mockResolvedValue(makeResponse(200, 'OK'))

      const result = await checkUrl('https://soroban-testnet.stellar.org', '/health')

      expect(result.detail).toBe('200 OK')
    })

    it('concatenates baseUrl and path correctly when calling fetch', async () => {
      fetchSpy.mockResolvedValue(makeResponse(200, 'OK'))

      await checkUrl('https://horizon-testnet.stellar.org', '/')

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://horizon-testnet.stellar.org/',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })

    it('sends an Accept: application/json header', async () => {
      fetchSpy.mockResolvedValue(makeResponse(200, 'OK'))

      await checkUrl('https://example.com', '/api')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { Accept: 'application/json' } }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // degraded — non-200 HTTP response
  // -------------------------------------------------------------------------
  describe('degraded status', () => {
    it('returns status "degraded" on a 503 response', async () => {
      fetchSpy.mockResolvedValue(makeResponse(503, 'Service Unavailable'))

      const result = await checkUrl('https://soroban-testnet.stellar.org', '/health')

      expect(result.status).toBe('degraded')
    })

    it('returns status "degraded" on a 429 response', async () => {
      fetchSpy.mockResolvedValue(makeResponse(429, 'Too Many Requests'))

      const result = await checkUrl('https://horizon-testnet.stellar.org', '/')

      expect(result.status).toBe('degraded')
    })

    it('returns status "degraded" on a 500 response', async () => {
      fetchSpy.mockResolvedValue(makeResponse(500, 'Internal Server Error'))

      const result = await checkUrl('https://example.com', '/health')

      expect(result.status).toBe('degraded')
    })

    it('returns status "degraded" on a 404 response', async () => {
      fetchSpy.mockResolvedValue(makeResponse(404, 'Not Found'))

      const result = await checkUrl('https://example.com', '/health')

      expect(result.status).toBe('degraded')
    })

    it('includes the HTTP status code and text in the detail string on non-200', async () => {
      fetchSpy.mockResolvedValue(makeResponse(503, 'Service Unavailable'))

      const result = await checkUrl('https://example.com', '/health')

      expect(result.detail).toBe('503 Service Unavailable')
    })
  })

  // -------------------------------------------------------------------------
  // down — network error or timeout
  // -------------------------------------------------------------------------
  describe('down status', () => {
    it('returns status "down" when fetch throws a network error', async () => {
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await checkUrl('https://soroban-testnet.stellar.org', '/health')

      expect(result.status).toBe('down')
    })

    it('returns detail "Unreachable" when fetch throws', async () => {
      fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))

      const result = await checkUrl('https://horizon-testnet.stellar.org', '/')

      expect(result.detail).toBe('Unreachable')
    })

    it('returns status "down" when the request is aborted (timeout)', async () => {
      // Simulate an AbortError — what happens when the AbortController fires.
      const abortError = new DOMException('The operation was aborted.', 'AbortError')
      fetchSpy.mockRejectedValue(abortError)

      const result = await checkUrl('https://soroban-testnet.stellar.org', '/health')

      expect(result.status).toBe('down')
      expect(result.detail).toBe('Unreachable')
    })

    it('returns status "down" on any thrown error, not just network errors', async () => {
      fetchSpy.mockRejectedValue(new RangeError('unexpected error'))

      const result = await checkUrl('https://example.com', '/health')

      expect(result.status).toBe('down')
    })
  })

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------
  describe('return shape', () => {
    it('always returns an object with status and detail fields', async () => {
      fetchSpy.mockResolvedValue(makeResponse(200, 'OK'))

      const result = await checkUrl('https://example.com', '/health')

      expect(result).toHaveProperty('status')
      expect(result).toHaveProperty('detail')
    })

    it('status is one of "ok" | "degraded" | "down"', async () => {
      fetchSpy.mockResolvedValue(makeResponse(200, 'OK'))

      const result = await checkUrl('https://example.com', '/health')

      expect(['ok', 'degraded', 'down']).toContain(result.status)
    })
  })
})
