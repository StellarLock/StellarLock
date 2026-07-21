/**
 * DELETE /api/notifications/subscribe/:lockId?address=G...
 *
 * Removes a notification subscription. Both lockId (path param or query param)
 * and the subscriber's Stellar address (query param) are required to prevent
 * one user from deleting another's subscription.
 *
 * Query params:
 *   lockId   – the lock id (e.g. "token:1042" or bare "1042")
 *   address  – subscriber's Stellar G... address
 *
 * Responses:
 *   200 { deleted: true }   – subscription removed (or didn't exist)
 *   400 { error }           – missing / invalid params
 *   405                     – method not DELETE
 */

import { db, initDb } from '../../indexer/db.js'

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

interface Res {
  status(code: number): { json(payload: unknown): void; end(): void }
}

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

export default function handler(req: Req, res: Res) {
  if (req.method !== 'DELETE') {
    return res.status(405).end()
  }

  initDb()

  const rawLockId = typeof req.query?.lockId === 'string' ? req.query.lockId : undefined
  const address = typeof req.query?.address === 'string' ? req.query.address : undefined

  if (!rawLockId) {
    return res.status(400).json({ error: 'lockId query param is required' })
  }
  if (!address || !STELLAR_ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: 'address query param must be a valid Stellar address' })
  }

  const lockId = /^\d+$/.test(rawLockId) ? `token:${rawLockId}` : rawLockId

  db.prepare(
    'DELETE FROM notification_subscriptions WHERE address = ? AND lock_id = ?',
  ).run(address, lockId)

  return res.status(200).json({ deleted: true })
}
