# Notification Service Architecture

> **Status: Implemented.** The cron worker (`indexer/notifier.ts`), subscription API (`api/notifications/`), database schema (`notification_subscriptions` table in `indexer/db.ts`), and email UI (`src/components/locks/NotificationSettings.tsx`) are all shipped. Email delivery uses [Resend](https://resend.com). Set `RESEND_API_KEY`, `EMAIL_FROM`, and `WEBHOOK_SECRET` environment variables before deploying.

Backend service for monitoring lock timestamps and dispatching unlock notifications via email, webhook, and browser push when locks approach their unlock dates.

## Components

### 1. Lock Monitor Worker

Runs on a cron schedule (every hour). For each registered notification subscription:

1. Read the lock's `unlock_at` timestamp via `get_lock(id)` simulation
2. Compare against current time to determine if a reminder threshold was crossed
3. Dispatch notifications for thresholds: 7 days, 1 day, and at unlock

```
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐
│  Cron Worker  │────▶│  Soroban RPC   │────▶│  Lock Contract   │
│  (every 1h)  │     │  (simulate)   │     │  get_lock(id)    │
└──────┬───────┘     └───────────────┘     └──────────────────┘
       │
       ├──▶ Email (SendGrid / Resend)
       ├──▶ Webhook (POST to user URL)
       └──▶ Web Push (via push subscription)
```

### 2. Subscription API

REST endpoints for the frontend to register/unregister notification preferences.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/notifications/subscribe` | Register for lock notifications |
| DELETE | `/api/notifications/subscribe/:lockId` | Unsubscribe from a lock |
| GET | `/api/notifications/subscriptions` | List user's subscriptions |

#### Subscribe payload

```json
{
  "lockId": "1042",
  "address": "G...",
  "channels": {
    "email": "user@example.com",
    "webhook": "https://discord.com/api/webhooks/...",
    "webPush": { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
  }
}
```

### 3. Database Schema

```sql
CREATE TABLE notification_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_id       TEXT NOT NULL,
  address       TEXT NOT NULL,
  email         TEXT,
  webhook_url   TEXT,
  push_sub      JSONB,
  reminded_7d   BOOLEAN DEFAULT FALSE,
  reminded_1d   BOOLEAN DEFAULT FALSE,
  reminded_0d   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subs_lock ON notification_subscriptions(lock_id);
CREATE INDEX idx_subs_reminded ON notification_subscriptions(reminded_0d) WHERE NOT reminded_0d;
```

## Webhook Payload Format

```json
{
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

## Tech Stack Recommendation

- **Runtime**: Node.js or Deno
- **Database**: PostgreSQL (Supabase or Neon for managed)
- **Email**: Resend or SendGrid
- **Web Push**: `web-push` npm package
- **Deployment**: Fly.io, Railway, or Cloudflare Workers + D1

## Security Considerations

- Rate-limit subscription creation per address
- Validate webhook URLs (no internal IPs, SSRF prevention)
- Sign webhook payloads with HMAC so receivers can verify authenticity
- Encrypt email addresses at rest
- Authenticate subscription API with wallet signature verification
