// @vitest-environment node
/**
 * Tests for api/notifications/verify.ts (double opt-in confirmation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = { prepare: vi.fn() }

vi.mock('../../indexer/db.js', () => ({
  db: mockDb,
  initDb: vi.fn(),
}))

import handler from './verify.js'
import { hashVerifyToken } from '../../indexer/mailer.js'

const TOKEN = 'a'.repeat(64)

function makeRes() {
  const calls: { code: number; body?: string } = { code: 0 }
  const chain = {
    send: vi.fn((body: string) => {
      calls.body = body
    }),
    json: vi.fn(),
    end: vi.fn(),
  }
  return {
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      calls.code = code
      return chain
    }),
    _calls: calls,
    _chain: chain,
  }
}

describe('GET /api/notifications/verify', () => {
  let get: ReturnType<typeof vi.fn>
  let run: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    get = vi.fn()
    run = vi.fn()
    mockDb.prepare.mockReturnValue({ get, run })
  })

  it('marks the subscription verified for a valid, fresh token', () => {
    get.mockReturnValue({ id: 'sub-1', email_verify_sent_at: Math.floor(Date.now() / 1000) - 60 })
    const res = makeRes()

    handler({ method: 'GET', query: { token: TOKEN } }, res)

    expect(get).toHaveBeenCalledWith(hashVerifyToken(TOKEN))
    expect(run).toHaveBeenCalledWith('sub-1')
    const updateSql = mockDb.prepare.mock.calls.map((c) => String(c[0])).find((q) => q.includes('UPDATE'))
    expect(updateSql).toMatch(/email_verified = 1/)
    expect(updateSql).toMatch(/email_verify_token_hash = NULL/)
    expect(res._calls.code).toBe(200)
  })

  it('rejects an unknown token', () => {
    get.mockReturnValue(undefined)
    const res = makeRes()

    handler({ method: 'GET', query: { token: TOKEN } }, res)

    expect(run).not.toHaveBeenCalled()
    expect(res._calls.code).toBe(400)
  })

  it('rejects an expired token', () => {
    get.mockReturnValue({ id: 'sub-1', email_verify_sent_at: Math.floor(Date.now() / 1000) - 49 * 3600 })
    const res = makeRes()

    handler({ method: 'GET', query: { token: TOKEN } }, res)

    expect(run).not.toHaveBeenCalled()
    expect(res._calls.code).toBe(400)
  })

  it('rejects a malformed token without touching the db', () => {
    const res = makeRes()

    handler({ method: 'GET', query: { token: 'nope' } }, res)

    expect(mockDb.prepare).not.toHaveBeenCalled()
    expect(res._calls.code).toBe(400)
  })

  it('rejects a missing token', () => {
    const res = makeRes()

    handler({ method: 'GET', query: {} }, res)

    expect(res._calls.code).toBe(400)
  })

  it.each(['POST', 'PUT', 'DELETE'])('returns 405 for %s', (method) => {
    const res = makeRes()

    handler({ method, query: { token: TOKEN } }, res)

    expect(res._calls.code).toBe(405)
    expect(res._chain.end).toHaveBeenCalled()
  })
})
