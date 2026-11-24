// @vitest-environment node
/**
 * Tests for api/notifications/unsubscribe-email.ts (signed one-click unsubscribe).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockDb = {
  prepare: vi.fn(),
  transaction: vi.fn((fn: () => void) => fn),
}

vi.mock('../../indexer/db.js', () => ({
  db: mockDb,
  initDb: vi.fn(),
}))

import handler from './unsubscribe-email.js'
import { unsubscribeToken } from '../../indexer/mailer.js'

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

describe('/api/notifications/unsubscribe-email', () => {
  let run: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.NOTIFICATION_LINK_SECRET = 'test-secret'
    vi.clearAllMocks()
    run = vi.fn()
    mockDb.prepare.mockReturnValue({ run })
  })

  afterEach(() => {
    delete process.env.NOTIFICATION_LINK_SECRET
  })

  it('GET with a valid signature shows a confirmation form without unsubscribing', () => {
    const res = makeRes()

    handler({ method: 'GET', query: { id: 'sub-1', token: unsubscribeToken('sub-1') } }, res)

    expect(res._calls.code).toBe(200)
    expect(res._calls.body).toContain('<form method="post"')
    expect(run).not.toHaveBeenCalled()
  })

  it('POST with a valid signature removes the email channel', () => {
    const res = makeRes()

    handler({ method: 'POST', query: { id: 'sub-1', token: unsubscribeToken('sub-1') } }, res)

    expect(res._calls.code).toBe(200)
    const sqls = mockDb.prepare.mock.calls.map((c) => String(c[0]))
    expect(sqls.some((q) => /SET email = NULL/.test(q))).toBe(true)
    expect(sqls.some((q) => /DELETE FROM notification_subscriptions/.test(q))).toBe(true)
    expect(run).toHaveBeenCalledWith('sub-1')
  })

  it('rejects a signature for a different subscription', () => {
    const res = makeRes()

    handler({ method: 'POST', query: { id: 'sub-2', token: unsubscribeToken('sub-1') } }, res)

    expect(res._calls.code).toBe(400)
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects a missing token', () => {
    const res = makeRes()

    handler({ method: 'POST', query: { id: 'sub-1' } }, res)

    expect(res._calls.code).toBe(400)
    expect(run).not.toHaveBeenCalled()
  })

  it.each(['PUT', 'PATCH', 'DELETE'])('returns 405 for %s', (method) => {
    const res = makeRes()

    handler({ method, query: { id: 'sub-1', token: unsubscribeToken('sub-1') } }, res)

    expect(res._calls.code).toBe(405)
  })
})
