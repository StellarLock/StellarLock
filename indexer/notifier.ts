/**
 * Notification cron worker.
 *
 * Call `runNotifier()` on a schedule (e.g. every hour via setInterval or an
 * external cron trigger). It scans `notification_subscriptions` for locks that
 * are approaching their unlock date and dispatches email + webhook reminders at
 * three thresholds: 7 days, 1 day, and at unlock (0 days).
 *
 * Required environment variables:
 *   RESEND_API_KEY   – Resend API key for transactional email
 *   EMAIL_FROM       – Sender address, e.g. "StellarLock <notify@stellarlock.xyz>"
 *   WEBHOOK_SECRET   – HMAC secret used to sign outbound webhook payloads
 *
 * Emails are only sent to verified addresses (see /api/notifications/verify)
 * and every reminder carries a signed one-click unsubscribe link plus a
 * List-Unsubscribe header (see indexer/mailer.ts).
 *
 * Optional:
 *   NOTIFIER_INTERVAL_MS – how often to run in self-hosted mode (default 3600000 = 1h)
 */

import { createHmac, randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { pathToFileURL } from 'node:url'
import { db, initDb } from './db.js'
import { createBackendLogger } from './logger.js'
import { lockUrl, sendResendEmail, unsubscribeUrl } from './mailer.js'
import { safeLookup, validateWebhookUrl } from './ssrf.js'

const log = createBackendLogger('notifier')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscriptionRow {
  id: string
  lock_id: string
  address: string
  email: string | null
  email_verified: number
  webhook_url: string | null
  reminded_7d: number
  reminded_1d: number
  reminded_0d: number
}

interface LockRow {
  id: string
  token: string
  amount: string
  beneficiary: string
  unlock_at: number
  status: string
}

type ReminderTier = '7d' | '1d' | '0d'

interface ReminderJob {
  sub: SubscriptionRow
  lock: LockRow
  tier: ReminderTier
  reminderDays: number
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? ''
const NOTIFIER_INTERVAL_MS = Number(process.env.NOTIFIER_INTERVAL_MS ?? 3_600_000)
const WEBHOOK_TIMEOUT_MS = 10_000
const EMAIL_TIMEOUT_MS = 10_000

const ONE_DAY_S = 86_400
const SEVEN_DAYS_S = 7 * ONE_DAY_S

// ---------------------------------------------------------------------------
// Email via Resend
// ---------------------------------------------------------------------------

async function sendEmail(to: string, lock: LockRow, tier: ReminderTier): Promise<void> {
  if (!RESEND_API_KEY) {
    log.warn('RESEND_API_KEY not set; skipping email', { recipient: to })
    return
  }

/** Build the reminder email (subject, body with unsubscribe link, headers). */
function buildReminderEmail(
  subscriptionId: string,
  lock: Pick<LockRow, 'id' | 'unlock_at'>,
  tier: ReminderTier,
): { subject: string; text: string; headers: Record<string, string> } {
  const unlockDate = new Date(lock.unlock_at * 1000).toUTCString()
  const url = lockUrl(lock.id)
  const unsubUrl = unsubscribeUrl(subscriptionId)

  const subject =
    tier === '0d'
      ? `Your lock #${lock.id} has unlocked`
      : `Reminder: lock #${lock.id} unlocks in ${tier === '7d' ? '7 days' : '1 day'}`

  const main =
    tier === '0d'
      ? `Your StellarLock (ID: ${lock.id}) has reached its unlock date (${unlockDate}). You can now withdraw your tokens.\n\n${url}`
      : `Your StellarLock (ID: ${lock.id}) will unlock on ${unlockDate}.\n\nVisit ${url} to view details or extend the lock.`

  // Bound the request: a hung connection would otherwise stall the whole
  // dispatch batch and delay every later reminder.
  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to,
        subject,
        text: body,
      }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    })
  } catch (err) {
    console.error(`[notifier] Resend request for ${to} (lock ${lock.id}) failed:`, err)
    return
  }

  if (!res.ok) {
    const text = await res.text()
    log.error('Resend email failed', { recipient: to, lockId: lock.id, response: text })
    console.error(`[notifier] Resend error for ${to} (lock ${lock.id}):`, text)
  const text = `${main}\n\n--\nDon't want these reminders? Unsubscribe: ${unsubUrl}`

  return {
    subject,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}

async function sendEmail(sub: SubscriptionRow, lock: LockRow, tier: ReminderTier): Promise<void> {
  if (!sub.email) return
  await sendResendEmail({ to: sub.email, ...buildReminderEmail(sub.id, lock, tier) })
}

// ---------------------------------------------------------------------------
// Webhook dispatch
// ---------------------------------------------------------------------------

/**
 * Sign `${timestamp}.${payload}` so a captured delivery can't be replayed
 * indefinitely: receivers reject timestamps outside their tolerance window
 * (see docs/notification-service.md).
 */
export function signPayload(timestamp: number, payload: string, secret = WEBHOOK_SECRET): string {
  if (!secret) return ''
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
}

async function sendWebhookReminder(url: string, lock: LockRow, tier: ReminderTier): Promise<void> {
  const reminderDays = tier === '7d' ? 7 : tier === '1d' ? 1 : 0
  const deliveryId = randomUUID()
  const timestamp = Math.floor(Date.now() / 1000)
  const payload = JSON.stringify({
    deliveryId,
    timestamp,
    event: tier === '0d' ? 'unlocked' : 'unlock_reminder',
    lockId: lock.id,
    unlockAt: lock.unlock_at,
    reminderDays,
    token: lock.token,
    amount: lock.amount,
    beneficiary: lock.beneficiary,
  })

  const sig = signPayload(timestamp, payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-StellarLock-Timestamp': String(timestamp),
    'X-StellarLock-Delivery': deliveryId,
  }
  if (sig) headers['X-StellarLock-Signature'] = sig

  // Re-validate at dispatch time: the URL was checked at subscribe time, but
  // its DNS may have changed since (or the row predates the resolving check).
  const urlErr = await validateWebhookUrl(url)
  if (urlErr) {
    log.warn('webhook rejected', { url, reason: urlErr })
    return
  }

  try {
    const status = await postWebhook(url, headers, payload)
    if (status >= 300 && status < 400) {
      log.warn('webhook redirect rejected', { url, status })
    } else if (status < 200 || status >= 300) {
      log.error('webhook delivery failed', { url, status })
    }
  } catch (err) {
    log.error('webhook delivery threw', { url, error: err })
  }
}

/**
 * POST via node:http(s) rather than fetch so the connection goes through
 * `safeLookup`: the address actually connected to is SSRF-checked (closing the
 * DNS-rebinding window between validation and connect), and redirects are
 * never followed, so a validated endpoint can't 3xx-pivot to an internal host.
 * Resolves with the response status code.
 */
function postWebhook(url: string, headers: Record<string, string>, body: string): Promise<number> {
  const parsed = new URL(url)
  const request = parsed.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const req = request(
      parsed,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        lookup: safeLookup,
        // Fresh connection per webhook: no pooled sockets to user-controlled hosts.
        agent: false,
        timeout: WEBHOOK_TIMEOUT_MS,
      },
      (res) => {
        res.resume() // discard the body
        resolve(res.statusCode ?? 0)
      },
    )
    req.on('timeout', () => req.destroy(new Error(`timed out after ${WEBHOOK_TIMEOUT_MS}ms`)))
    req.on('error', reject)
    req.end(body)
  })
}

// ---------------------------------------------------------------------------
// Core scan logic
// ---------------------------------------------------------------------------

/**
 * Determine which reminder tier (if any) is due for a subscription.
 *
 * Only the most specific crossed tier is returned: a subscriber who signs up
 * (or whose lock is indexed) inside the 1-day window gets just the 1-day
 * reminder, not the 7-day one too. Earlier tiers are marked done alongside
 * it when the job is dispatched (see `markStmt`).
 */
export function dueTier(
  sub: Pick<SubscriptionRow, 'reminded_7d' | 'reminded_1d' | 'reminded_0d'>,
  lock: Pick<LockRow, 'unlock_at'>,
  nowS: number,
): ReminderTier | null {
  const secondsUntil = lock.unlock_at - nowS

  // At-unlock: unlock has passed (or is right now)
  if (secondsUntil <= 0) return sub.reminded_0d ? null : '0d'
  // 1-day window: unlock is ≤1 day away
  if (secondsUntil <= ONE_DAY_S) return sub.reminded_1d ? null : '1d'
  // 7-day window: unlock is ≤7 days away
  if (secondsUntil <= SEVEN_DAYS_S) return sub.reminded_7d ? null : '7d'
  return null
}

// Marking a tier also marks every earlier tier, so a skipped reminder is
// never sent later in the same or a subsequent run.
const markStmt = {
  '7d': (id: string) =>
    db.prepare('UPDATE notification_subscriptions SET reminded_7d = 1 WHERE id = ?').run(id),
  '1d': (id: string) =>
    db
      .prepare('UPDATE notification_subscriptions SET reminded_7d = 1, reminded_1d = 1 WHERE id = ?')
      .run(id),
  '0d': (id: string) =>
    db
      .prepare(
        'UPDATE notification_subscriptions SET reminded_7d = 1, reminded_1d = 1, reminded_0d = 1 WHERE id = ?',
      )
      .run(id),
}

function markComplete(id: string) {
  db.prepare(
    'UPDATE notification_subscriptions SET reminded_7d = 1, reminded_1d = 1, reminded_0d = 1 WHERE id = ?',
  ).run(id)
}

async function dispatchJob(job: ReminderJob): Promise<void> {
  const { sub, lock, tier } = job

  const dispatches: Promise<void>[] = []

  // Double opt-in: unverified addresses only ever get the confirmation email
  // sent by /api/notifications/subscribe, never reminders.
  if (sub.email && sub.email_verified) {
    dispatches.push(sendEmail(sub, lock, tier))
  }
  if (sub.webhook_url) {
    dispatches.push(sendWebhookReminder(sub.webhook_url, lock, tier))
  }

  await Promise.allSettled(dispatches)

  // Mark as sent regardless of delivery outcome — avoids hammering on transient
  // failures. Operators should monitor Resend/webhook logs for delivery errors.
  markStmt[tier](sub.id)
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runNotifier(): Promise<void> {
  initDb()

  const nowS = Math.floor(Date.now() / 1000)

  // Load all subscriptions that still have at least one reminder to send.
  // The index on reminded_0d = 0 keeps this fast even with many rows.
  const subs = db
    .prepare(
      `SELECT * FROM notification_subscriptions
       WHERE reminded_0d = 0`,
    )
    .all() as SubscriptionRow[]

  if (subs.length === 0) return

  const lockIds = [...new Set(subs.map((s) => s.lock_id))]

  // Fetch the corresponding lock rows in one query.
  const placeholders = lockIds.map(() => '?').join(',')
  const locks = db
    .prepare(`SELECT id, token, amount, beneficiary, unlock_at, status FROM locks WHERE id IN (${placeholders})`)
    .all(...lockIds) as LockRow[]

  const lockMap = new Map(locks.map((l) => [l.id, l]))

  const jobs: ReminderJob[] = []

  for (const sub of subs) {
    const lock = lockMap.get(sub.lock_id)
    if (!lock) continue // lock not yet indexed — skip

    const tier = dueTier(sub, lock, nowS)
    if (tier) {
    // Nothing left to remind about once the lock has been withdrawn: close the
    // subscription out so it drops off the pending scan.
    if (lock.status === 'withdrawn') {
      markComplete(sub.id)
      continue
    }

    const tiers = dueTiers(sub, lock, nowS)
    for (const tier of tiers) {
      jobs.push({ sub, lock, tier, reminderDays: tier === '7d' ? 7 : tier === '1d' ? 1 : 0 })
    }
  }

  if (jobs.length === 0) return

  log.info('dispatching reminders', { count: jobs.length })

  // Run all jobs concurrently but cap parallelism to avoid hammering APIs.
  const CONCURRENCY = 10
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    await Promise.allSettled(jobs.slice(i, i + CONCURRENCY).map(dispatchJob))
  }

  log.info('reminder dispatch complete', { count: jobs.length })
}

// ---------------------------------------------------------------------------
// Self-hosted runner (node indexer/notifier.ts)
// ---------------------------------------------------------------------------

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  log.info('notifier started', { intervalMs: NOTIFIER_INTERVAL_MS })
  void runNotifier()
  const timer = setInterval(() => {
    void runNotifier()
  }, NOTIFIER_INTERVAL_MS)

  const shutdown = (signal: string) => {
    console.log(`[notifier] received ${signal}, shutting down gracefully…`)
    clearInterval(timer)
    db.close()
    console.log(`[notifier] clean shutdown complete`)
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}
