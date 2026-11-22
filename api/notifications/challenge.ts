/**
 * GET /api/notifications/challenge?address=G...
 *
 * Issues a short-lived, single-use nonce and the message the wallet must sign
 * to prove ownership of `address`. Redeem it at POST /api/notifications/session.
 *
 * Responses:
 *   200 { nonce, message, expiresAt }
 *   400 { error }   – missing / invalid address
 *   405             – method not GET
 */

import { issueChallenge, STELLAR_ADDRESS_RE } from '../_lib/notification-auth.js'

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

interface Res {
  status(code: number): { json(payload: unknown): void; end(): void }
}

export default function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  const address = typeof req.query?.address === 'string' ? req.query.address : undefined
  if (!address || !STELLAR_ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: 'address query param must be a valid Stellar address' })
  }

  return res.status(200).json(issueChallenge(address))
}
