/**
 * POST /api/notifications/subscribe
 *
 * Upserts a notification subscription for a lock. The caller identifies
 * themselves by their Stellar address; at minimum one channel (email or
 * webhook_url) must be provided.
 *
 * Request body (JSON):
 * {
 *   lockId:      string          – e.g. "token:1042" or "1042"
 *   address:     string          – Stellar G... address of the subscriber
 *   email?:      string          – email address for reminders
 *   webhookUrl?: string          – URL to POST unlock events to
 * }
 *
 * Responses:
 *   201 { id }            – subscription created / updated
 *   400 { error }         – validation failure
 *   405                   – method not POST
 */

import { randomUUID } from 'node:crypto'
import { db, initDb } from '../../indexer/db.js'

interface Req {
  method?: string
  body?: unknown
}

interface Res {
  status(code: number): { json(payload: unknown): void; end(): void }
}

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Simple SSRF guard: reject private/loopback ranges
const PRIVATE_URL_RE = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i

function validateWebhookUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'webhookUrl must use http or https'
    if (PRIVATE_URL_RE.test(url)) return 'webhookUrl must not point to a private network address'
    return null
  } catch {
    return 'webhookUrl is not a valid URL'
  }
}

export default function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  initDb()

  const body = req.body as Record<string, unknown> | null | undefined

  const rawLockId = body?.lockId
  const address = body?.address
  const email = body?.email ?? null
  const webhookUrl = body?.webhookUrl ?? null

  // --- Validation ---
  if (typeof rawLockId !== 'string' || !rawLockId.trim()) {
    return res.status(400).json({ error: 'lockId is required' })
  }
  if (typeof address !== 'string' || !STELLAR_ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: 'address must be a valid Stellar address' })
  }
  if (email !== null && (typeof email !== 'string' || !EMAIL_RE.test(email))) {
    return res.status(400).json({ error: 'email is not a valid email address' })
  }
  if (webhookUrl !== null) {
    if (typeof webhookUrl !== 'string') {
      return res.status(400).json({ error: 'webhookUrl must be a string' })
    }
    const urlErr = validateWebhookUrl(webhookUrl)
    if (urlErr) return res.status(400).json({ error: urlErr })
  }
  if (!email && !webhookUrl) {
    return res.status(400).json({ error: 'at least one of email or webhookUrl is required' })
  }

  // Normalise lockId: bare numeric ids are treated as token locks
  const lockId = /^\d+$/.test(rawLockId.trim()) ? `token:${rawLockId.trim()}` : rawLockId.trim()

  // Upsert: if a subscription already exists for this (address, lock_id) pair,
  // update the channels. Reset reminder flags only when channels change so we
  // don't re-send reminders that were already dispatched.
  const existing = db
    .prepare('SELECT id, email, webhook_url FROM notification_subscriptions WHERE address = ? AND lock_id = ?')
    .get(address, lockId) as { id: string; email: string | null; webhook_url: string | null } | undefined

  if (existing) {
    const channelsChanged =
      (email ?? null) !== (existing.email ?? null) ||
      (webhookUrl ?? null) !== (existing.webhook_url ?? null)

    db.prepare(
      `UPDATE notification_subscriptions
       SET email = ?, webhook_url = ?${channelsChanged ? ', reminded_7d = 0, reminded_1d = 0, reminded_0d = 0' : ''}
       WHERE id = ?`,
    ).run(email ?? null, webhookUrl ?? null, existing.id)

    return res.status(201).json({ id: existing.id })
  }

  const id = randomUUID()
  db.prepare(
    `INSERT INTO notification_subscriptions (id, lock_id, address, email, webhook_url)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, lockId, address, email ?? null, webhookUrl ?? null)

  return res.status(201).json({ id })
}
