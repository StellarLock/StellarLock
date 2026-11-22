/**
 * /api/notifications/unsubscribe-email?id=<subscriptionId>&token=<hmac>
 *
 * Signed unsubscribe link included in every reminder email.
 *
 *   GET  – shows a confirmation page with a single "Unsubscribe" button
 *          (link scanners that prefetch GETs can't unsubscribe anyone).
 *   POST – performs the unsubscribe. This is also the RFC 8058 one-click
 *          target used by mail clients via the List-Unsubscribe and
 *          List-Unsubscribe-Post headers.
 *
 * Unsubscribing removes the email channel. If the subscription also has a
 * webhook it is kept for that channel; otherwise the row is deleted.
 *
 * Responses:
 *   200 – confirmation page / unsubscribed
 *   400 – missing or invalid signature
 *   405 – any other method
 */

import { db, initDb } from '../../indexer/db.js'
import { unsubscribeToken, verifyUnsubscribeToken } from '../../indexer/mailer.js'
import { escapeHtml, sendHtml, type HtmlRes } from './_html.js'

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

export default function handler(req: Req, res: HtmlRes) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end()
  }

  const id = typeof req.query?.id === 'string' ? req.query.id : ''
  const token = typeof req.query?.token === 'string' ? req.query.token : ''

  if (!id || !/^[0-9a-f]+$/i.test(token) || !verifyUnsubscribeToken(id, token)) {
    return sendHtml(res, 400, 'Invalid link', '<p>This unsubscribe link is invalid.</p>')
  }

  if (req.method === 'GET') {
    const action = `?id=${encodeURIComponent(id)}&token=${encodeURIComponent(unsubscribeToken(id))}`
    return sendHtml(
      res,
      200,
      'Unsubscribe from reminders',
      `<p>Stop receiving unlock reminder emails for this lock?</p>` +
        `<form method="post" action="${escapeHtml(action)}">` +
        `<input type="hidden" name="List-Unsubscribe" value="One-Click">` +
        `<button type="submit">Unsubscribe</button></form>`,
    )
  }

  initDb()

  db.transaction(() => {
    db.prepare(
      `UPDATE notification_subscriptions
       SET email = NULL, email_verified = 0, email_verify_token_hash = NULL, email_verify_sent_at = NULL
       WHERE id = ?`,
    ).run(id)
    db.prepare('DELETE FROM notification_subscriptions WHERE id = ? AND webhook_url IS NULL').run(id)
  })()

  return sendHtml(res, 200, 'Unsubscribed', '<p>You will no longer receive reminder emails for this lock.</p>')
}
