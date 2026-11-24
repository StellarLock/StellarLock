/**
 * Shared email helpers for the notifier and the notifications API.
 *
 * - `sendResendEmail` posts a plain-text message through Resend.
 * - `lockUrl` builds the in-app URL for an indexer lock id (`token:1000`).
 * - `unsubscribeToken` / `verifyUnsubscribeToken` sign and check the
 *   one-click unsubscribe links included in every reminder email.
 * - `createVerifyToken` / `hashVerifyToken` back the double opt-in flow.
 *
 * Environment variables:
 *   RESEND_API_KEY            – Resend API key (emails are skipped when unset)
 *   EMAIL_FROM                – sender address
 *   PUBLIC_APP_URL            – base URL used for links in emails
 *   NOTIFICATION_LINK_SECRET  – HMAC key for unsubscribe links (falls back to
 *                               WEBHOOK_SECRET)
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const EMAIL_FROM = process.env.EMAIL_FROM ?? 'StellarLock <notify@stellarlock.xyz>'

const APP_BASE_URL = (process.env.PUBLIC_APP_URL ?? 'https://app.stellarlock.xyz').replace(/\/+$/, '')

function resendApiKey(): string {
  return process.env.RESEND_API_KEY ?? ''
}

function linkSecret(): string {
  return process.env.NOTIFICATION_LINK_SECRET || process.env.WEBHOOK_SECRET || ''
}

// ---------------------------------------------------------------------------
// Lock links
// ---------------------------------------------------------------------------

/**
 * Convert an indexer lock id (`token:1000`, `lp:7`, or a bare `1000`) into the
 * app route `/app/lock/<kind>/<id>`.
 */
export function lockPath(lockId: string): string {
  const sep = lockId.indexOf(':')
  const kind = sep === -1 ? 'token' : lockId.slice(0, sep)
  const id = sep === -1 ? lockId : lockId.slice(sep + 1)
  return `/app/lock/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`
}

export function lockUrl(lockId: string): string {
  return `${APP_BASE_URL}${lockPath(lockId)}`
}

// ---------------------------------------------------------------------------
// Unsubscribe links
// ---------------------------------------------------------------------------

export function unsubscribeToken(subscriptionId: string): string {
  return createHmac('sha256', linkSecret()).update(`unsubscribe:${subscriptionId}`).digest('hex')
}

export function verifyUnsubscribeToken(subscriptionId: string, token: string): boolean {
  if (!linkSecret()) return false
  const expected = Buffer.from(unsubscribeToken(subscriptionId), 'hex')
  const given = Buffer.from(token, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export function unsubscribeUrl(subscriptionId: string): string {
  const params = new URLSearchParams({ id: subscriptionId, token: unsubscribeToken(subscriptionId) })
  return `${APP_BASE_URL}/api/notifications/unsubscribe-email?${params.toString()}`
}

// ---------------------------------------------------------------------------
// Email verification (double opt-in)
// ---------------------------------------------------------------------------

/** Tokens older than this are rejected by /api/notifications/verify. */
export const VERIFY_TOKEN_TTL_S = 48 * 3600

/** Returns the raw token (goes in the email) and its hash (goes in the DB). */
export function createVerifyToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex')
  return { token, hash: hashVerifyToken(token) }
}

export function hashVerifyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyUrl(token: string): string {
  return `${APP_BASE_URL}/api/notifications/verify?token=${encodeURIComponent(token)}`
}

export async function sendVerificationEmail(to: string, lockId: string, token: string): Promise<void> {
  await sendResendEmail({
    to,
    subject: 'Confirm your StellarLock unlock reminders',
    text:
      `Someone (hopefully you) asked to receive unlock reminders for StellarLock lock ${lockId} at this address.\n\n` +
      `Confirm by opening this link within 48 hours:\n${verifyUrl(token)}\n\n` +
      `If you didn't request this, ignore this email — you won't receive any reminders.`,
  })
}

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

interface EmailMessage {
  to: string
  subject: string
  text: string
  headers?: Record<string, string>
}

export async function sendResendEmail(msg: EmailMessage): Promise<void> {
  const apiKey = resendApiKey()
  if (!apiKey) {
    console.warn('[mailer] RESEND_API_KEY not set — skipping email to', msg.to)
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.headers ? { headers: msg.headers } : {}),
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[mailer] Resend error for ${msg.to} (${msg.subject}):`, text)
  }
}
