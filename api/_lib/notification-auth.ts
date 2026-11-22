/**
 * Proof-of-address-ownership for the notification API.
 *
 * Stellar addresses are public, so a bare `address` in a request proves
 * nothing. Instead the client:
 *
 *   1. GET  /api/notifications/challenge?address=G…  → { nonce, message }
 *   2. signs `message` with its wallet (SEP-53 / Freighter `signMessage`)
 *   3. POST /api/notifications/session { address, nonce, signature } → { token }
 *   4. sends `Authorization: Bearer <token>` on subscribe / unsubscribe /
 *      subscriptions; the token's subject must match the request's address.
 *
 * Nonces are single-use, short-lived and stored in SQLite. Session tokens are
 * stateless HMAC-SHA256 tokens keyed by NOTIFICATIONS_SESSION_SECRET.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { db, initDb } from '../../indexer/db.js'

export const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/

/** How long a challenge nonce may be redeemed for a session. */
const NONCE_TTL_SECONDS = 5 * 60
/** How long an issued session token is valid. */
const SESSION_TTL_SECONDS = 60 * 60

/** SEP-53 signed-message prefix. */
const SEP53_PREFIX = 'Stellar Signed Message:\n'

interface Req {
  headers?: Record<string, string | string[] | undefined>
}

interface Res {
  status(code: number): { json(payload: unknown): void; end(): void }
}

// ---------------------------------------------------------------------------
// Secret
// ---------------------------------------------------------------------------

let ephemeralSecret: Buffer | null = null

function getSecret(): Buffer {
  const configured = process.env.NOTIFICATIONS_SESSION_SECRET
  if (configured && configured.length >= 32) return Buffer.from(configured, 'utf8')
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    throw new Error('NOTIFICATIONS_SESSION_SECRET must be set (at least 32 characters) in production')
  }
  // Dev fallback: per-process random secret. Sessions don't survive restarts.
  ephemeralSecret ??= randomBytes(32)
  return ephemeralSecret
}

// ---------------------------------------------------------------------------
// Nonces
// ---------------------------------------------------------------------------

function ensureNonceTable() {
  initDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_auth_nonces (
      nonce      TEXT PRIMARY KEY,
      address    TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `)
}

/** The exact text the wallet is asked to sign for a given challenge. */
function buildChallengeMessage(address: string, nonce: string, expiresAt: number): string {
  return [
    'StellarLock wants you to sign in to manage unlock notifications.',
    '',
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt * 1000).toISOString()}`,
  ].join('\n')
}

export function issueChallenge(address: string): { nonce: string; message: string; expiresAt: number } {
  ensureNonceTable()
  const now = Math.floor(Date.now() / 1000)
  const nonce = randomBytes(16).toString('hex')
  const expiresAt = now + NONCE_TTL_SECONDS

  db.prepare('DELETE FROM notification_auth_nonces WHERE expires_at < ?').run(now)
  db.prepare('INSERT INTO notification_auth_nonces (nonce, address, expires_at) VALUES (?, ?, ?)').run(
    nonce,
    address,
    expiresAt,
  )

  return { nonce, message: buildChallengeMessage(address, nonce, expiresAt), expiresAt }
}

/**
 * Consume a nonce (single use). Returns the challenge message it was issued
 * with, or null if the nonce is unknown, expired, or belongs to another address.
 */
function consumeNonce(address: string, nonce: string): string | null {
  ensureNonceTable()
  const row = db
    .prepare('SELECT address, expires_at FROM notification_auth_nonces WHERE nonce = ?')
    .get(nonce) as { address: string; expires_at: number } | undefined
  if (!row) return null

  db.prepare('DELETE FROM notification_auth_nonces WHERE nonce = ?').run(nonce)

  if (row.address !== address) return null
  if (row.expires_at < Math.floor(Date.now() / 1000)) return null
  return buildChallengeMessage(address, nonce, row.expires_at)
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

function decodeSignature(signature: string): Buffer | null {
  const trimmed = signature.trim()
  const buf = /^[0-9a-f]{128}$/i.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64')
  return buf.length === 64 ? buf : null
}

/**
 * Verify a wallet signature over `message` for `address`. Accepts the SEP-53
 * scheme (ed25519 over sha256("Stellar Signed Message:\n" + message)), which
 * Freighter and Stellar Wallets Kit use.
 */
function verifyMessageSignature(address: string, message: string, signature: string): boolean {
  const sig = decodeSignature(signature)
  if (!sig) return false
  try {
    const keypair = Keypair.fromPublicKey(address)
    const digest = createHash('sha256').update(SEP53_PREFIX + message, 'utf8').digest()
    return keypair.verify(digest, sig)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

function issueSessionToken(address: string): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const payload = Buffer.from(JSON.stringify({ sub: address, exp: expiresAt }), 'utf8').toString('base64url')
  return { token: `${payload}.${sign(payload)}`, expiresAt }
}

/** Returns the address the token was issued to, or null if invalid/expired. */
function verifySessionToken(token: string): string | null {
  const [payload, mac, extra] = token.split('.')
  if (!payload || !mac || extra !== undefined) return null

  const expected = Buffer.from(sign(payload), 'utf8')
  const given = Buffer.from(mac, 'utf8')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown
      exp?: unknown
    }
    if (typeof sub !== 'string' || !STELLAR_ADDRESS_RE.test(sub)) return null
    if (typeof exp !== 'number' || exp < Math.floor(Date.now() / 1000)) return null
    return sub
  } catch {
    return null
  }
}

/**
 * Redeem a signed challenge for a session token. Returns null when the nonce
 * is invalid/expired/reused or the signature doesn't match the address.
 */
export function redeemChallenge(
  address: string,
  nonce: string,
  signature: string,
): { token: string; expiresAt: number } | null {
  const message = consumeNonce(address, nonce)
  if (!message) return null
  if (!verifyMessageSignature(address, message, signature)) return null
  return issueSessionToken(address)
}

// ---------------------------------------------------------------------------
// Request guard
// ---------------------------------------------------------------------------

function bearerToken(req: Req): string | null {
  const raw = req.headers?.authorization ?? req.headers?.Authorization
  const header = Array.isArray(raw) ? raw[0] : raw
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/**
 * Ensure the request carries a valid session for `address`. Writes a 401
 * (missing/invalid session) or 403 (session for a different address) and
 * returns false when it doesn't; returns true otherwise.
 */
export function requireAddressSession(req: Req, res: Res, address: string): boolean {
  const token = bearerToken(req)
  const subject = token ? verifySessionToken(token) : null
  if (!subject) {
    res.status(401).json({ error: 'a valid notification session is required' })
    return false
  }
  if (subject !== address) {
    res.status(403).json({ error: 'session does not belong to this address' })
    return false
  }
  return true
}
