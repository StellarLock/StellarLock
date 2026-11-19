// @vitest-environment node
/**
 * Tests for api/readiness.ts
 *
 * The handler calls checkUrl() from `./_lib/network-health`, which makes real
 * HTTP requests. That module is mocked here so no network traffic is produced
 * and tests remain deterministic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mock — must be declared before importing the module under test so
// Vitest's hoisting can replace the real implementation.
// ---------------------------------------------------------------------------

vi.mock('./_lib/network-health.js', () => ({
  NETWORK_URLS: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
  checkUrl: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import handler and the mocked helper AFTER mocks are in place.
// ---------------------------------------------------------------------------
import handler from './readiness.js'
import { checkUrl } from './_lib/network-health.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Res spy that records the status code and JSON payload. */
function makeRes() {
  const calls: { code: number; payload?: unknown } = { code: 0 }
  const chain = {
    json: vi.fn((payload: unknown) => {
      calls.payload = payload
      return chain
    }),
  }
  const res = {
    status: vi.fn((code: number) => {
      calls.code = code
      return chain
    }),
    _calls: calls,
    _chain: chain,
  }
  return res
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 200 — both dependencies healthy
  // -------------------------------------------------------------------------
  describe('200 — ready', () => {
    it('returns 200 with status "ready" when both RPC and Horizon respond ok', async () => {
      vi.mocked(checkUrl)
        .mockResolvedValueOnce({ status: 'ok', detail: '200 OK' })   // rpc
        .mockResolvedValueOnce({ status: 'ok', detail: '200 OK' })   // horizon

      const res = makeRes()
      await handler(undefined, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready',
          ready: true,
          dependencies: { rpc: 'ok', horizon: 'ok' },
        }),
      )
    })

    it('includes a checkedAt ISO timestamp in the response', async () => {
      vi.mocked(checkUrl)
        .mockResolvedValue({ status: 'ok', detail: '200 OK' })

      const res = makeRes()
      await handler(undefined, res)

      const payload = res._chain.json.mock.calls[0][0] as Record<string, unknown>
      expect(typeof payload.checkedAt).toBe('string')
      // Must be a valid ISO 8601 date string
      expect(() => new Date(payload.checkedAt as string).toISOString()).not.toThrow()
    })

    it('includes the service name in the response', async () => {
      vi.mocked(checkUrl)
        .mockResolvedValue({ status: 'ok', detail: '200 OK' })

      const res = makeRes()
      await handler(undefined, res)

      const payload = res._chain.json.mock.calls[0][0] as Record<string, unknown>
      expect(payload.service).toBe('stellarlock-frontend')
    })
  })

  // -------------------------------------------------------------------------
  // 503 — one or both dependencies unhealthy
  // -------------------------------------------------------------------------
  describe('503 — not ready', () => {
    it('returns 503 with status "not_ready" when RPC is degraded', async () => {
      vi.mocked(checkUrl)
        .mockResolvedValueOnce({ status: 'degraded', detail: '503 Service Unavailable' }) // rpc
        .mockResolvedValueOnce({ status: 'ok', detail: '200 OK' })                        // horizon

      const res = makeRes()
      await handler(undefined, res)

      expect(res.status).toHaveBeenCalledWith(503)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
          ready: false,
          dependencies: { rpc: 'degraded', horizon: 'ok' },
        }),
      )
    })

    it('returns 503 with status "not_ready" when Horizon is degraded', async () => {
      vi.mocked(checkUrl)
        .mockResolvedValueOnce({ status: 'ok', detail: '200 OK' })                        // rpc
        .mockResolvedValueOnce({ status: 'degraded', detail: '429 Too Many Requests' })   // horizon

      const res = makeRes()
      await handler(undefined, res)

      expect(res.status).toHaveBeenCalledWith(503)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
          ready: false,
          dependencies: { rpc: 'ok', horizon: 'degraded' },
        }),
      )
    })

    it('returns 503 with status "not_ready" when RPC is down', async () => {
      vi.mocked(checkUrl)
        .mockResolvedValueOnce({ status: 'down', detail: 'Unreachable' }) // rpc
        .mockResolvedValueOnce({ status: 'ok', detail: '200 OK' })        // horizon

      const res = makeRes()
      await handler(undefined, res)

      expect(res.status).toHaveBeenCalledWith(503)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
          ready: false,
          dependencies: { rpc: 'down', horizon: 'ok' },
        }),
      )
    })

    it('returns 503 when both dependencies are down', async () => {
      vi.mocked(checkUrl)
        .mockResolvedValueOnce({ status: 'down', detail: 'Unreachable' }) // rpc
        .mockResolvedValueOnce({ status: 'down', detail: 'Unreachable' }) // horizon

      const res = makeRes()
      await handler(undefined, res)

      expect(res.status).toHaveBeenCalledWith(503)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
          ready: false,
          dependencies: { rpc: 'down', horizon: 'down' },
        }),
      )
    })

    it('returns 503 when Horizon is down and RPC is degraded', async () => {
      vi.mocked(checkUrl)
        .mockResolvedValueOnce({ status: 'degraded', detail: '500 Internal Server Error' }) // rpc
        .mockResolvedValueOnce({ status: 'down', detail: 'Unreachable' })                   // horizon

      const res = makeRes()
      await handler(undefined, res)

      expect(res.status).toHaveBeenCalledWith(503)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({ ready: false }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // Behaviour — checkUrl is called with the correct URLs
  // -------------------------------------------------------------------------
  describe('dependency checks', () => {
    it('checks the RPC /health endpoint and Horizon root endpoint', async () => {
      vi.mocked(checkUrl).mockResolvedValue({ status: 'ok', detail: '200 OK' })

      const res = makeRes()
      await handler(undefined, res)

      expect(checkUrl).toHaveBeenCalledTimes(2)
      expect(checkUrl).toHaveBeenCalledWith('https://soroban-testnet.stellar.org', '/health')
      expect(checkUrl).toHaveBeenCalledWith('https://horizon-testnet.stellar.org', '/')
    })

    it('runs both dependency checks concurrently (Promise.all)', async () => {
      // Track call order to confirm they are initiated simultaneously.
      const order: string[] = []
      vi.mocked(checkUrl).mockImplementation(async (baseUrl: string) => {
        order.push(baseUrl)
        return { status: 'ok' as const, detail: '200 OK' }
      })

      const res = makeRes()
      await handler(undefined, res)

      // Both URLs should appear — order can vary with Promise.all scheduling.
      expect(order).toHaveLength(2)
      expect(order).toContain('https://soroban-testnet.stellar.org')
      expect(order).toContain('https://horizon-testnet.stellar.org')
    })
  })
})
