// @vitest-environment node
/**
 * Tests for api/notifications/unsubscribe.ts
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
import handler from './unsubscribe.js'

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /api/notifications/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: db.prepare().run() succeeds without error.
    mockDb.prepare.mockReturnValue({ run: vi.fn() })
  })

  // -------------------------------------------------------------------------
  // 200 — happy path
  // -------------------------------------------------------------------------
  describe('200 — subscription deleted', () => {
    it('returns 200 { deleted: true } for an existing subscription', () => {
      const req = makeReq('DELETE', { lockId: 'token:42', address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res._chain.json).toHaveBeenCalledWith({ deleted: true })
    })

    it('still returns 200 { deleted: true } when the subscription does not exist (idempotent)', () => {
      // better-sqlite3 run() succeeds even if no rows were affected.
      mockDb.prepare.mockReturnValue({ run: vi.fn().mockReturnValue({ changes: 0 }) })

      const req = makeReq('DELETE', { lockId: 'token:99', address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res._chain.json).toHaveBeenCalledWith({ deleted: true })
    })

    it('normalises a bare numeric lockId to "token:<id>" before querying', () => {
      const runMock = vi.fn()
      mockDb.prepare.mockReturnValue({ run: runMock })

      const req = makeReq('DELETE', { lockId: '1042', address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      // The DELETE statement should have received 'token:1042', not '1042'.
      const [addr, lockId] = runMock.mock.calls[0]
      expect(addr).toBe(VALID_ADDRESS)
      expect(lockId).toBe('token:1042')
    })
  })

  // -------------------------------------------------------------------------
  // 400 — validation failures
  // -------------------------------------------------------------------------
  describe('400 — validation errors', () => {
    it('returns 400 when lockId query param is missing', () => {
      const req = makeReq('DELETE', { address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringMatching(/lockId/i) }),
      )
    })

    it('returns 400 when lockId is an empty string', () => {
      const req = makeReq('DELETE', { lockId: '', address: VALID_ADDRESS })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when address query param is missing', () => {
      const req = makeReq('DELETE', { lockId: 'token:1' })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringMatching(/address/i) }),
      )
    })

    it('returns 400 when address is not a valid Stellar address', () => {
      const req = makeReq('DELETE', { lockId: 'token:1', address: 'bad-address' })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when address starts with G but is too short', () => {
      const req = makeReq('DELETE', { lockId: 'token:1', address: 'GABC123' })
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  // -------------------------------------------------------------------------
  // 405 — wrong method
  // -------------------------------------------------------------------------
  describe('405 — method not allowed', () => {
    it.each(['GET', 'POST', 'PUT', 'PATCH'])('returns 405 for %s', (method) => {
      const req = makeReq(method)
      const res = makeRes()

      handler(req, res)

      expect(res.status).toHaveBeenCalledWith(405)
      expect(res._chain.end).toHaveBeenCalled()
    })
  })
})
