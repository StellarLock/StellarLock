# Notification Service Architecture

> **Status: Implemented.** The cron worker (`indexer/notifier.ts`), subscription API (`api/notifications/`), database schema (`notification_subscriptions` table in `indexer/db.ts`), and email UI (`src/components/locks/NotificationSettings.tsx`) are all shipped. Email delivery uses [Resend](https://resend.com). Set `RESEND_API_KEY`, `EMAIL_FROM`, and `WEBHOOK_SECRET` environment variables before deploying.

Backend service for monitoring lock timestamps and dispatching unlock notifications via email and webhook when locks approach their unlock dates.

## Components

### 1. Lock Monitor Worker

Runs on a cron schedule (every hour). For each registered notification subscription:

1. Read the lock's `unlock_at`, `token`, `amount`, and `beneficiary` directly from the local `locks` SQLite table (written by `indexer/index.ts`'s event poller)
2. Compare against current time to determine if a reminder threshold was crossed
3. Dispatch notifications for thresholds: 7 days, 1 day, and at unlock

> **Note:** The worker relies on the indexer's event-replay pipeline being up to date to have accurate lock state.

```
┌──────────────┐     ┌──────────────────────┐
│  Cron Worker  │────▶│ SQLite `locks` Table │◀──── (indexer/index.ts event poller)
│  (every 1h)  │     │ (read unlock_at etc.)│
└──────┬───────┘     └──────────────────────┘
       │
       ├──▶ Email (Resend)
       └──▶ Webhook (POST to user URL)
```

### 2. Subscription API

REST endpoints for the frontend to register/unregister notification preferences.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/notifications/subscribe` | Register for lock notifications |
| DELETE | `/api/notifications/unsubscribe?lockId=...&address=...` | Unsubscribe from a lock |
| GET | `/api/notifications/subscriptions` | List user's subscriptions |
| GET | `/api/notifications/verify?token=...` | Confirm an email address (double opt-in link) |
| GET / POST | `/api/notifications/unsubscribe-email?id=...&token=...` | Signed one-click email unsubscribe (GET shows a confirm button; POST unsubscribes, RFC 8058) |

#### Subscribe payload

```json
{
  "lockId": "token:1042",
  "address": "G...",
  "email": "user@example.com",
  "webhookUrl": "https://discord.com/api/webhooks/..."
}
```

At least one of `email` or `webhookUrl` must be provided.

Emails use double opt-in: a new or changed address is stored unverified and
sent a confirmation link (`/api/notifications/verify`, valid for 48 hours).
Reminders are only emailed to verified addresses. Every reminder email
includes a signed unsubscribe link and `List-Unsubscribe` /
`List-Unsubscribe-Post` headers. Subscriptions for withdrawn locks are closed
out without sending further reminders.

#### Unsubscribe parameters

Query parameters:
- `lockId`: the lock id (e.g. `token:1042` or bare `1042`)
- `address`: subscriber's Stellar `G...` address

Example: `DELETE /api/notifications/unsubscribe?lockId=token:1042&address=G...`


### 3. Database Schema

```sql
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id          TEXT PRIMARY KEY,
  lock_id     TEXT NOT NULL,
  address     TEXT NOT NULL,
  email       TEXT,
  webhook_url TEXT,
  reminded_7d INTEGER DEFAULT 0,
  reminded_1d INTEGER DEFAULT 0,
  reminded_0d INTEGER DEFAULT 0,
  created_at  INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_subs_lock    ON notification_subscriptions(lock_id);
CREATE INDEX IF NOT EXISTS idx_subs_address ON notification_subscriptions(address);
CREATE INDEX IF NOT EXISTS idx_subs_pending ON notification_subscriptions(reminded_0d)
  WHERE reminded_0d = 0;
```

## Webhook Payload Format

```json
{
  "deliveryId": "6f1c2a9e-3b7d-4e0a-9c2f-1d5e8b7a4c30",
  "timestamp": 1735084800,
  "event": "unlock_reminder",
  "lockId": "1042",
  "unlockAt": 1735689600,
  "reminderDays": 7,
  "token": "CUSDC...",
  "amount": "10000.0000000",
  "beneficiary": "G..."
}
```

Events: `unlock_reminder` (7d, 1d before) and `unlocked` (at unlock time).

Each subscription receives at most one reminder per notifier run. If the
subscriber signs up late (e.g. inside the 1-day window), only the most specific
due reminder is sent and the earlier ones are skipped. When a lock is extended,
reminders whose thresholds are in the future again are re-armed for the new
unlock date.

### Webhook headers

| Header | Description |
|--------|-------------|
| `X-StellarLock-Timestamp` | Unix seconds when the delivery was signed (also in the body as `timestamp`) |
| `X-StellarLock-Delivery` | Unique id for this delivery (also in the body as `deliveryId`) — use it to drop duplicates |
| `X-StellarLock-Signature` | Hex HMAC-SHA256 of `` `${timestamp}.${rawBody}` `` keyed with `WEBHOOK_SECRET` (omitted when no secret is configured) |

### Verifying a webhook

Receivers should verify the signature over the **raw** request body, reject
deliveries whose timestamp falls outside a tolerance window (5 minutes is a
sensible default), and ignore delivery ids they've already processed. Without
the timestamp check, a captured delivery could be replayed indefinitely.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

const TOLERANCE_S = 300

export function verifyStellarLockWebhook(
  rawBody: string,
  headers: Record<string, string | undefined>,
  secret: string,
): boolean {
  const timestamp = Number(headers['x-stellarlock-timestamp'])
  const signature = headers['x-stellarlock-signature'] ?? ''
  if (!Number.isInteger(timestamp)) return false

  // Reject stale (or far-future) deliveries to defeat replays.
  const ageS = Math.abs(Math.floor(Date.now() / 1000) - timestamp)
  if (ageS > TOLERANCE_S) return false

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(signature, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
```

After a successful verification, record `X-StellarLock-Delivery` and discard
any later delivery with the same id.

## Security Considerations

- Rate-limit subscription creation per address
- Validate webhook URLs (no internal IPs, SSRF prevention)
- Sign webhook payloads with HMAC so receivers can verify authenticity
- Encrypt email addresses at rest
- Authenticate subscription API with wallet signature verification
