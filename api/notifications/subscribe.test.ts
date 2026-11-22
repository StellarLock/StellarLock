// @vitest-environment node
/**
 * Tests for api/notifications/subscribe.ts
 *
 * The handler depends on `../../indexer/db` and `../../indexer/ssrf`.
 * Both are mocked at the module level so no real SQLite file is touched
 * and no real DNS lookup is performed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any import of the module under test.
// ---------------------------------------------------------------------------

const mockDb = {
  prepare: vi.fn(),
}

vi.mock('../../indexer/db.js', () => ({
  db: mockDb,
  initDb: vi.fn(),
}))

// Session auth is exercised separately — treat every request as authenticated.
vi.mock('../_lib/notification-auth.js', () => ({
  requireAddressSession: vi.fn(() => true),
}))

vi.mock('../../indexer/ssrf.js', () => ({
  validateWebhookUrl: vi.fn().mockResolvedValue(null), // allow by default
}))

vi.mock('../../indexer/mailer.js', () => ({
  createVerifyToken: vi.fn(() => ({ token: 'raw-token', hash: 'hashed-token' })),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Import handler AFTER mocks are in place.
// ---------------------------------------------------------------------------
import handler from './subscribe.js'
import { validateWebhookUrl } from '../../indexer/ssrf.js'
import { sendVerificationEmail } from '../../indexer/mailer.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A valid 56-character Stellar G... address (A-Z2-7 after the G). */
const VALID_ADDRESS = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

/** Build a minimal Req object. */
function makeReq(method: string, body: Record<string, unknown> | null = null) {
  return { method, body }
}

/** Build a minimal Res spy that records status + payload. */
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

/** Wire up a db.prepare().get() stub that returns the given row (or undefined). */
function stubDbGet(row: unknown) {
  mockDb.prepare.mockReturnValue({ get: vi.fn().mockReturnValue(row), run: vi.fn() })
}

/** Wire up a db.prepare().run() stub (for INSERT/UPDATE paths). */
function stubDbRun() {
  mockDb.prepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined), run: vi.fn() })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/notifications/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no existing subscription → INSERT path.
    stubDbRun()
  })

  // -------------------------------------------------------------------------
  // 201 — happy path
  // -------------------------------------------------------------------------
  describe('201 — valid subscription', () => {
    it('returns 201 with an id when email is provided', async () => {
      const req = makeReq('POST', {
        lockId: 'token:42',
        address: VALID_ADDRESS,
        email: 'user@example.com',
      })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.any(String) }),
      )
    })

    it('returns 201 with an id when webhookUrl is provided', async () => {
      const req = makeReq('POST', {
        lockId: 'token:99',
        address: VALID_ADDRESS,
        webhookUrl: 'https://hooks.example.com/notify',
      })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.any(String) }),
      )
    })

    it('passes the lockId as-is (no bare-numeric normalisation)', async () => {
      const insertRun = vi.fn()
      mockDb.prepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined), run: insertRun })

      const contractId = 'CCONTRACTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      const req = makeReq('POST', {
        lockId: `${contractId}:1042`,
        address: VALID_ADDRESS,
        email: 'user@example.com',
      })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      // The INSERT call should receive the full contract-namespaced lock id.
      const insertCall = insertRun.mock.calls[0]
      expect(insertCall).toBeDefined()
      expect(insertCall[1]).toBe(`${contractId}:1042`)
    })

    it('returns the existing id when the subscription already exists', async () => {
      const existingId = 'existing-uuid-1234'
      // db.prepare().get() returns an existing row on the first SELECT call,
      // then db.prepare().run() handles the UPDATE.
      mockDb.prepare
        .mockReturnValueOnce({ get: vi.fn().mockReturnValue({ id: existingId, email: null, webhook_url: null }) })
        .mockReturnValueOnce({ run: vi.fn() })

      const req = makeReq('POST', {
        lockId: 'token:1',
        address: VALID_ADDRESS,
        email: 'user@example.com',
      })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res._chain.json).toHaveBeenCalledWith({ id: existingId })
    })
  })

  // -------------------------------------------------------------------------
  // Double opt-in
  // -------------------------------------------------------------------------
  describe('email verification', () => {
    it('stores a new email unverified and sends a confirmation link', async () => {
      const insertRun = vi.fn()
      mockDb.prepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined), run: insertRun })

      const res = makeRes()
      await handler(makeReq('POST', { lockId: 'token:5', address: VALID_ADDRESS, email: 'user@example.com' }), res)

      expect(res.status).toHaveBeenCalledWith(201)
      const sql = mockDb.prepare.mock.calls.map((c) => String(c[0])).find((q) => q.includes('INSERT'))
      expect(sql).toMatch(/email_verified/)
      // Only the hash of the token is persisted.
      expect(insertRun.mock.calls[0]).toContain('hashed-token')
      expect(insertRun.mock.calls[0]).not.toContain('raw-token')
      expect(sendVerificationEmail).toHaveBeenCalledWith('user@example.com', 'token:5', 'raw-token')
    })

    it('does not send a confirmation email for webhook-only subscriptions', async () => {
      const res = makeRes()
      await handler(
        makeReq('POST', { lockId: 'token:5', address: VALID_ADDRESS, webhookUrl: 'https://hooks.example.com/x' }),
        res,
      )

      expect(res.status).toHaveBeenCalledWith(201)
      expect(sendVerificationEmail).not.toHaveBeenCalled()
    })

    it('does not re-send confirmation when the email is unchanged and already verified', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue({
          id: 'sub-1',
          email: 'user@example.com',
          webhook_url: null,
          email_verified: 1,
          email_verify_sent_at: null,
        }),
      })

      const res = makeRes()
      await handler(makeReq('POST', { lockId: 'token:5', address: VALID_ADDRESS, email: 'user@example.com' }), res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(sendVerificationEmail).not.toHaveBeenCalled()
    })

    it('resets verification and sends a new link when the email changes', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue({
          id: 'sub-1',
          email: 'old@example.com',
          webhook_url: null,
          email_verified: 1,
          email_verify_sent_at: null,
        }),
      })

      const res = makeRes()
      await handler(makeReq('POST', { lockId: 'token:5', address: VALID_ADDRESS, email: 'new@example.com' }), res)

      const updateSql = mockDb.prepare.mock.calls.map((c) => String(c[0])).find((q) => q.includes('UPDATE'))
      expect(updateSql).toMatch(/email_verified = 0/)
      expect(sendVerificationEmail).toHaveBeenCalledWith('new@example.com', 'token:5', 'raw-token')
    })

    it('rate-limits confirmation re-sends for an unchanged unverified email', async () => {
      mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue({
          id: 'sub-1',
          email: 'user@example.com',
          webhook_url: null,
          email_verified: 0,
          email_verify_sent_at: Math.floor(Date.now() / 1000) - 60,
        }),
      })

      const res = makeRes()
      await handler(makeReq('POST', { lockId: 'token:5', address: VALID_ADDRESS, email: 'user@example.com' }), res)

      expect(sendVerificationEmail).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // 400 — validation failures
  // -------------------------------------------------------------------------
  describe('400 — validation errors', () => {
    it('returns 400 when lockId is missing', async () => {
      const req = makeReq('POST', { address: VALID_ADDRESS, email: 'u@example.com' })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res._chain.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }))
    })

    it('returns 400 when lockId is an empty string', async () => {
      const req = makeReq('POST', { lockId: '   ', address: VALID_ADDRESS, email: 'u@example.com' })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when address is missing', async () => {
      const req = makeReq('POST', { lockId: 'token:1', email: 'u@example.com' })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when address is not a valid Stellar address', async () => {
      const req = makeReq('POST', { lockId: 'token:1', address: 'not-a-valid-address', email: 'u@example.com' })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when email is provided but invalid', async () => {
      const req = makeReq('POST', { lockId: 'token:1', address: VALID_ADDRESS, email: 'not-an-email' })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 when neither email nor webhookUrl is provided', async () => {
      const req = makeReq('POST', { lockId: 'token:1', address: VALID_ADDRESS })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringMatching(/email|webhook/i) }),
      )
    })

    it('returns 400 when webhookUrl fails SSRF validation', async () => {
      vi.mocked(validateWebhookUrl).mockResolvedValueOnce('webhookUrl must not point to a private network address')

      const req = makeReq('POST', {
        lockId: 'token:1',
        address: VALID_ADDRESS,
        webhookUrl: 'http://169.254.169.254/latest/meta-data/',
      })
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res._chain.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('private') }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // 405 — wrong method
  // -------------------------------------------------------------------------
  describe('405 — method not allowed', () => {
    it.each(['GET', 'PUT', 'PATCH', 'DELETE'])('returns 405 for %s', async (method) => {
      const req = makeReq(method)
      const res = makeRes()

      await handler(req, res)

      expect(res.status).toHaveBeenCalledWith(405)
      expect(res._chain.end).toHaveBeenCalled()
    })
  })
})
