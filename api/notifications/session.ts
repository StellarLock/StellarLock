/**
 * POST /api/notifications/session
 *
 * Exchanges a wallet-signed challenge (see GET /api/notifications/challenge)
 * for a short-lived session token. Send it as `Authorization: Bearer <token>`
 * to subscribe / unsubscribe / subscriptions.
 *
 * Request body (JSON):
 * {
 *   address:   string   – Stellar G... address that signed the challenge
 *   nonce:     string   – nonce returned by the challenge endpoint
 *   signature: string   – base64 (or hex) ed25519 signature of the challenge
 *                         message, per SEP-53 (Freighter `signMessage`)
 * }
 *
 * Responses:
 *   200 { token, expiresAt }
 *   400 { error }   – malformed request
 *   401 { error }   – unknown/expired/reused nonce or bad signature
 *   405             – method not POST
 */

import { redeemChallenge, STELLAR_ADDRESS_RE } from '../_lib/notification-auth.js'

interface Req {
  method?: string
  body?: unknown
}

interface Res {
  status(code: number): { json(payload: unknown): void; end(): void }
}

export default function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const body = req.body as Record<string, unknown> | null | undefined
  const address = body?.address
  const nonce = body?.nonce
  const signature = body?.signature

  if (typeof address !== 'string' || !STELLAR_ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: 'address must be a valid Stellar address' })
  }
  if (typeof nonce !== 'string' || !nonce) {
    return res.status(400).json({ error: 'nonce is required' })
  }
  if (typeof signature !== 'string' || !signature) {
    return res.status(400).json({ error: 'signature is required' })
  }

  const session = redeemChallenge(address, nonce, signature)
  if (!session) {
    return res.status(401).json({ error: 'invalid or expired signature challenge' })
  }

  return res.status(200).json(session)
}
