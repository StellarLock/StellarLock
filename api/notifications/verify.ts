/**
 * GET /api/notifications/verify?token=<token>
 *
 * Confirms the email address on a notification subscription (double opt-in).
 * The token is the one emailed by /api/notifications/subscribe; only its
 * SHA-256 hash is stored. Tokens are single-use and expire after 48 hours.
 *
 * Responses (HTML, since this is opened from an email):
 *   200 – email confirmed
 *   400 – missing, unknown, or expired token
 *   405 – method not GET
 */

import { db, initDb } from '../../indexer/db.js'
import { hashVerifyToken, VERIFY_TOKEN_TTL_S } from '../../indexer/mailer.js'
import { sendHtml, type HtmlRes } from './_html.js'

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

const TOKEN_RE = /^[0-9a-f]{64}$/

export default function handler(req: Req, res: HtmlRes) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  const token = typeof req.query?.token === 'string' ? req.query.token : ''
  if (!TOKEN_RE.test(token)) {
    return sendHtml(res, 400, 'Invalid link', '<p>This confirmation link is invalid.</p>')
  }

  initDb()

  const row = db
    .prepare(
      `SELECT id, email_verify_sent_at FROM notification_subscriptions
       WHERE email_verify_token_hash = ? AND email IS NOT NULL`,
    )
    .get(hashVerifyToken(token)) as { id: string; email_verify_sent_at: number | null } | undefined

  const nowS = Math.floor(Date.now() / 1000)
  if (!row || row.email_verify_sent_at == null || nowS - row.email_verify_sent_at > VERIFY_TOKEN_TTL_S) {
    return sendHtml(
      res,
      400,
      'Link expired',
      '<p>This confirmation link is invalid or has expired. Subscribe again from the lock page to get a new one.</p>',
    )
  }

  db.prepare(
    `UPDATE notification_subscriptions
     SET email_verified = 1, email_verify_token_hash = NULL
     WHERE id = ?`,
  ).run(row.id)

  return sendHtml(res, 200, 'Email confirmed', '<p>You will now receive unlock reminders for this lock.</p>')
}
