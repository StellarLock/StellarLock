// @vitest-environment node
/**
 * Tests for api/notifications/subscriptions.ts
 *
 * The handler depends on `../../indexer/db`.
 * It is mocked at the module level so no real SQLite file is touched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks — hoisted before the import of the module under test.
// ---------------------------------------------------------------------------

const mockDb = {
  prepare: vi.fn(),
}

vi.mock('../../indexer/db.js', () => ({
  db: mockDb,
  initDb: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import handler AFTER mocks are in place.
// ---------------------------------------------------------------------------
import handler from './subscriptions.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A valid 56-character Stellar G... address. */
const VALID_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

/** Build a minimal Req with query params. */
function makeReq(method: string, query: Record<string, string | undefined> = {}) {
  return { method, query }
}

/** Build a minimal Res spy. */
function makeRes() {
  const calls: { code: number; payload?: unknown } = { code: 0 }
  const chain = {
    json: vi.fn((payload: unknown) => {
      calls.payload = payload
      return chain
    }),
    end: vi.fn(() => chain),
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

/** A realistic DB row for a notification subscription. */
function makeRow(overrides: Partial<{
  id: string
  lock_id: string
  address: string
  email: string | null
  webhook_url: string | null
  reminded_7d: number
  reminded_1d: number
  reminded_0d: number
  created_at: number
}> = {}) {
  return {
    id: 'sub-uuid-001',
    lock_id: 'token:42',
    address: VALID_ADDRESS,
    email: null,
    webhook_url: null,
    reminded_7d: 0,
    reminded_1d: 0,
    reminded_0d: 0,
    created_at: 1_700_000_000,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/notifications/subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 200 — happy paths
  // -------------------------------------------------------------------------
  describe('200 — subscriptions returned', () => {
    it('returns an empty subscriptions array when there are no subscriptions', () => {
      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) })

      const req = makeReq('GET', { address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res._chain.json).toHaveBeenCalledWith({ subscriptions: [] })
    })

    it('returns subscriptions with null email left as null', () => {
      const row = makeRow({ email: null, webhook_url: 'https://hooks.example.com' })
      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue([row]) })

      const req = makeReq('GET', { address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const { subscriptions } = res._chain.json.mock.calls[0][0] as { subscriptions: unknown[] }
      expect(subscriptions).toHaveLength(1)
      expect((subscriptions[0] as Record<string, unknown>).email).toBeNull()
    })

    it('redacts the email address — only shows first char and domain', () => {
      const row = makeRow({ email: 'alice@example.com' })
      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue([row]) })

      const req = makeReq('GET', { address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const { subscriptions } = res._chain.json.mock.calls[0][0] as { subscriptions: unknown[] }
      const sub = subscriptions[0] as Record<string, unknown>
      // Must NOT contain the full local part.
      expect(sub.email).not.toBe('alice@example.com')
      // Should follow the a***@domain.tld pattern.
      expect(sub.email).toMatch(/^a\*\*\*@example\.com$/)
    })

    it('redacts a single-character local part correctly', () => {
      const row = makeRow({ email: 'z@short.io' })
      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue([row]) })

      const req = makeReq('GET', { address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      const { subscriptions } = res._chain.json.mock.calls[0][0] as { subscriptions: unknown[] }
      expect((subscriptions[0] as Record<string, unknown>).email).toBe('z***@short.io')
    })

    it('maps reminded flags to boolean shape', () => {
      const row = makeRow({ reminded_7d: 1, reminded_1d: 0, reminded_0d: 1 })
      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue([row]) })

      const req = makeReq('GET', { address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      const { subscriptions } = res._chain.json.mock.calls[0][0] as {
        subscriptions: Array<{ reminded: { sevenDays: boolean; oneDay: boolean; atUnlock: boolean } }>
      }
      expect(subscriptions[0].reminded).toEqual({ sevenDays: true, oneDay: false, atUnlock: true })
    })

    it('returns multiple subscriptions in created_at ASC order (as returned by DB)', () => {
      const rows = [
        makeRow({ id: 'sub-1', lock_id: 'token:1', created_at: 1_000 }),
        makeRow({ id: 'sub-2', lock_id: 'token:2', created_at: 2_000 }),
      ]
      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue(rows) })

      const req = makeReq('GET', { address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      const { subscriptions } = res._chain.json.mock.calls[0][0] as { subscriptions: Array<{ id: string }> }
      expect(subscriptions.map((s) => s.id)).toEqual(['sub-1', 'sub-2'])
    })

    it('maps lock_id to camelCase lockId in the response', () => {
      const row = makeRow({ lock_id: 'token:77' })
      mockDb.prepare.mockReturnValue({ all: vi.fn().mockReturnValue([row]) })

      const req = makeReq('GET', { address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      const { subscriptions } = res._chain.json.mock.calls[0][0] as {
        subscriptions: Array<Record<string, unknown>>
      }
      expect(subscriptions[0].lockId).toBe('token:77')
      // snake_case key must not be present
      expect(subscriptions[0].lock_id).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // 400 — validation failures
  // -------------------------------------------------------------------------
  describe('400 — validation errors', () => {
    it('returns 400 when address query param is missing', () => {
      const req = makeReq('GET', {})
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
      )
    })

    it('returns 400 when address is not a valid Stellar G... address', () => {
      const req = makeReq('GET', { address: 'invalid-address' })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 for an address that starts with G but is malformed', () => {
      const req = makeReq('GET', { address: 'GSHORT' })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  // -------------------------------------------------------------------------
  // 405 — wrong method
  // -------------------------------------------------------------------------
  describe('405 — method not allowed', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('returns 405 for %s', (method) => {
      const req = makeReq(method, { address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(405)
      expect(res._chain.end).toHaveBeenCalled()
    })
  })
})
