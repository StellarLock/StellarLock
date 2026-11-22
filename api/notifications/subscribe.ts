/**
 * POST /api/notifications/subscribe
 *
 * Upserts a notification subscription for a lock. The caller must hold a
 * session for `address` (Authorization: Bearer <token>, obtained via
 * /api/notifications/challenge + /api/notifications/session); at minimum one
 * channel (email or webhook_url) must be provided.
 *
 * Request body (JSON):
 * {
 *   lockId:      string          – e.g. "CXXX…:1042"
 *   address:     string          – Stellar G... address of the subscriber
 *   email?:      string          – email address for reminders
 *   webhookUrl?: string          – URL to POST unlock events to
 * }
 *
 * Email channels use double opt-in: a new (or changed) email address is
 * stored unverified and sent a confirmation link pointing at
 * /api/notifications/verify. Reminders are only sent once it is confirmed.
 *
 * Responses:
 *   201 { id }            – subscription created / updated
 *   400 { error }         – validation failure
 *   401 { error }         – missing / invalid session
 *   403 { error }         – session belongs to a different address
 *   405                   – method not POST
 */

import { randomUUID } from 'node:crypto'
import { db, initDb } from '../../indexer/db.js'
import { createBackendLogger } from '../../indexer/logger.js'
import { validateWebhookUrl } from '../../indexer/ssrf.js'
import { requireAddressSession } from '../_lib/notification-auth.js'
import { createVerifyToken, sendVerificationEmail } from '../../indexer/mailer.js'

interface Req {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

interface Res {
  status(code: number): { json(payload: unknown): void; end(): void }
}

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LOCK_ID_RE = /^(?:(?:token|lp):\d+|\d+)$/
const MAX_EMAIL_LENGTH = 254
const log = createBackendLogger('api.notifications.subscribe')
/** Minimum gap between confirmation emails for the same unverified subscription. */
const VERIFY_RESEND_COOLDOWN_S = 10 * 60

async function sendConfirmation(email: string, lockId: string, token: string) {
  try {
    await sendVerificationEmail(email, lockId, token)
  } catch (err) {
    console.error('[subscribe] failed to send confirmation email:', err)
  }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  initDb()

  const body = req.body as Record<string, unknown> | null | undefined

  const rawLockId = body?.lockId
  const address = body?.address
  const email = body?.email as string | null | undefined
  const webhookUrl = body?.webhookUrl as string | null | undefined

  // --- Validation ---
  if (typeof rawLockId !== 'string' || !rawLockId.trim()) {
    return res.status(400).json({ error: 'lockId is required' })
  }
  if (!LOCK_ID_RE.test(rawLockId.trim())) {
    return res.status(400).json({ error: 'lockId must be a numeric id or token:<id>/lp:<id>' })
  }
  if (typeof address !== 'string' || !STELLAR_ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: 'address must be a valid Stellar address' })
  }
  if (
    email !== undefined &&
    email !== null &&
    (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email))
  ) {
  // Caller must prove they own `address` (see api/_lib/notification-auth.ts).
  if (!requireAddressSession(req, res, address)) return
  if (email !== undefined && email !== null && (typeof email !== 'string' || !EMAIL_RE.test(email))) {
    return res.status(400).json({ error: 'email is not a valid email address' })
  }
  if (webhookUrl !== undefined && webhookUrl !== null) {
    if (typeof webhookUrl !== 'string') {
      return res.status(400).json({ error: 'webhookUrl must be a string' })
    }
    // Resolves the hostname and rejects it if any address is private/reserved.
    const urlErr = await validateWebhookUrl(webhookUrl)
    if (urlErr) return res.status(400).json({ error: urlErr })
  }

  // Normalise lockId: bare numeric ids are treated as token locks
  const lockId = /^\d+$/.test(rawLockId.trim()) ? `token:${rawLockId.trim()}` : rawLockId.trim()
  log.debug('subscription request accepted', { lockId, hasEmail: Boolean(email), hasWebhook: Boolean(webhookUrl) })
  // Normalise lockId: trim whitespace only
  const lockId = rawLockId.trim()

  // Upsert: if a subscription already exists for this (address, lock_id) pair,
  // update the channels. Reset reminder flags only when channels change so we
  // don't re-send reminders that were already dispatched.
  const nowS = Math.floor(Date.now() / 1000)

  const existing = db
    .prepare(
      `SELECT id, email, webhook_url, email_verified, email_verify_sent_at
       FROM notification_subscriptions WHERE address = ? AND lock_id = ?`,
    )
    .get(address, lockId) as
    | {
        id: string
        email: string | null
        webhook_url: string | null
        email_verified?: number | null
        email_verify_sent_at?: number | null
      }
    | undefined

  // Preserve existing values for omitted fields (undefined means not provided;
  // an explicit null clears the channel).
  const newEmail = (email !== undefined ? email : existing?.email) ?? null
  const newWebhookUrl = (webhookUrl !== undefined ? webhookUrl : existing?.webhook_url) ?? null

  // null and undefined both mean "no channel" — a subscription must end up
  // with at least one channel after merging with any existing row.
  if (newEmail === null && newWebhookUrl === null) {
    return res.status(400).json({ error: 'at least one of email or webhookUrl is required' })
  }

  if (existing) {
    const channelsChanged =
      newEmail !== (existing.email ?? null) || newWebhookUrl !== (existing.webhook_url ?? null)
    // Preserve existing values for omitted fields (undefined means not provided)
    const newEmail = email !== undefined ? email : existing.email
    const newWebhookUrl = webhookUrl !== undefined ? webhookUrl : existing.webhook_url
    const emailChanged = (newEmail ?? null) !== (existing.email ?? null)
    const channelsChanged = emailChanged || (newWebhookUrl ?? null) !== (existing.webhook_url ?? null)

    // A new address always needs confirming. An unchanged but still
    // unverified address gets a fresh link, rate-limited so the endpoint
    // can't be used to flood an inbox with confirmation emails.
    const verified = !emailChanged && !!existing.email_verified
    const lastSent = existing.email_verify_sent_at ?? 0
    const sendVerify =
      !!newEmail && !verified && (emailChanged || nowS - lastSent >= VERIFY_RESEND_COOLDOWN_S)
    const verify = sendVerify ? createVerifyToken() : null

    db.prepare(
      `UPDATE notification_subscriptions
       SET email = ?, webhook_url = ?${channelsChanged ? ', reminded_7d = 0, reminded_1d = 0, reminded_0d = 0' : ''}${
         emailChanged ? ', email_verified = 0, email_verify_token_hash = NULL, email_verify_sent_at = NULL' : ''
       }
       WHERE id = ?`,
    ).run(newEmail, newWebhookUrl, existing.id)

    if (verify && newEmail) {
      db.prepare(
        'UPDATE notification_subscriptions SET email_verify_token_hash = ?, email_verify_sent_at = ? WHERE id = ?',
      ).run(verify.hash, nowS, existing.id)
      await sendConfirmation(newEmail, lockId, verify.token)
    }

    return res.status(201).json({ id: existing.id })
  }

  const id = randomUUID()
  const verify = email ? createVerifyToken() : null
  db.prepare(
    `INSERT INTO notification_subscriptions (id, lock_id, address, email, webhook_url)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, lockId, address, newEmail, newWebhookUrl)
    `INSERT INTO notification_subscriptions
       (id, lock_id, address, email, webhook_url, email_verified, email_verify_token_hash, email_verify_sent_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, lockId, address, email ?? null, webhookUrl ?? null, verify?.hash ?? null, verify ? nowS : null)

  if (verify && email) {
    await sendConfirmation(email, lockId, verify.token)
  }

  return res.status(201).json({ id })
}
