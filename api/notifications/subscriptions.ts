/**
 * GET /api/notifications/subscriptions?address=G...
 *
 * Returns all active notification subscriptions for the given Stellar address.
 * Email addresses are redacted in the response (only the domain is shown) to
 * avoid leaking PII through the API, and webhook URLs are reduced to scheme +
 * host so embedded tokens are never exposed.
 *
 * Requires `Authorization: Bearer <token>` for `address` (see
 * api/_lib/notification-auth.ts).
 *
 * Query params:
 *   address  – subscriber's Stellar G... address (required)
 *
 * Responses:
 *   200 { subscriptions: Subscription[] }
 *   400 { error }   – missing / invalid address
 *   401 { error }   – missing / invalid session
 *   403 { error }   – session belongs to a different address
 *   405             – method not GET
 */

import { db, initDb } from '../../indexer/db.js'
import { requireAddressSession } from '../_lib/notification-auth.js'

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
  headers?: Record<string, string | string[] | undefined>
}

interface Res {
  status(code: number): { json(payload: unknown): void; end(): void }
}

interface SubscriptionRow {
  id: string
  lock_id: string
  address: string
  email: string | null
  webhook_url: string | null
  reminded_7d: number
  reminded_1d: number
  reminded_0d: number
  created_at: number
}

/** Redact email to "u***@domain.tld" to avoid leaking full addresses. */
function redactEmail(email: string): string {
  const at = email.indexOf('@')
  if (at < 1) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const visible = local.slice(0, Math.min(1, local.length))
  return `${visible}***@${domain}`
}

/**
 * Redact a webhook URL to scheme + host ("https://hooks.slack.com/…").
 * Paths and query strings frequently embed secrets (Slack/Discord tokens),
 * so they are never returned. Userinfo and port are dropped too.
 */
function redactWebhookUrl(url: string): string {
  try {
    const { protocol, hostname } = new URL(url)
    return `${protocol}//${hostname}/…`
  } catch {
    return '***'
  }
}

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

export default function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  initDb()

  const address = typeof req.query?.address === 'string' ? req.query.address : undefined

  if (!address || !STELLAR_ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: 'address query param must be a valid Stellar address' })
  }
  // Caller must prove they own `address` (see api/_lib/notification-auth.ts).
  if (!requireAddressSession(req, res, address)) return

  const rows = db
    .prepare('SELECT * FROM notification_subscriptions WHERE address = ? ORDER BY created_at ASC')
    .all(address) as SubscriptionRow[]

  const subscriptions = rows.map((row) => ({
    id: row.id,
    lockId: row.lock_id,
    email: row.email ? redactEmail(row.email) : null,
    webhookUrl: row.webhook_url ? redactWebhookUrl(row.webhook_url) : null,
    reminded: {
      sevenDays: row.reminded_7d === 1,
      oneDay: row.reminded_1d === 1,
      atUnlock: row.reminded_0d === 1,
    },
    createdAt: row.created_at,
  }))

  return res.status(200).json({ subscriptions })
}
