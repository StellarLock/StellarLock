# Deploying the backend (indexer + notifier)

Operator guide for running the lock indexer (`indexer/index.ts`) and the
unlock-reminder notifier (`indexer/notifier.ts`) in production. For *why* they work
the way they do, see [indexer-architecture.md](./indexer-architecture.md) and
[notification-service.md](./notification-service.md). This guide covers *how to run
them*.

> Tracks [#1162](https://github.com/StellarLock/StellarLock/issues/1162).

---

## 1. What you are deploying

```
                 Soroban RPC
                      │  getEvents (every 10s)
                      ▼
┌───────────┐   ┌───────────┐  writes   ┌────────────────────────┐
│ frontend  │──▶│  api/*    │◀─────────▶│  lock-index.sqlite      │
│ (static)  │   │ handlers  │ reads/    │  (+ -wal, -shm files)   │
└───────────┘   └───────────┘ writes    └────────────────────────┘
                                          ▲ writes      ▲ reads/updates
                                    ┌─────┴────┐   ┌────┴──────┐
                                    │ indexer  │   │ notifier  │──▶ Resend / webhooks
                                    └──────────┘   └───────────┘
```

| Process | Entry point | Command | Long-running? |
|---|---|---|---|
| Indexer | `indexer/index.ts` | `pnpm indexer:start` | Yes. Polls every `INDEXER_POLL_INTERVAL_MS` |
| Notifier | `indexer/notifier.ts` | `pnpm notifier:start` | Yes. Runs `runNotifier()` immediately, then every `NOTIFIER_INTERVAL_MS` |
| API handlers | `api/indexer-stats.ts`, `api/indexer-locks.ts`, `api/notifications/*` | Serverless-style `handler(req, res)` | Per request |

### Hard constraints

1. **One SQLite file, one host.** All three components open the same
   `LOCK_INDEX_DB_PATH` through `better-sqlite3`. SQLite in WAL mode supports
   several processes **on the same machine**. It does not work over NFS, SMB, EFS or
   any network filesystem, and it cannot be shared between serverless instances.
   Put the database on local disk or a block volume attached to one host.
2. **Run exactly one indexer and one notifier.** Do not scale them horizontally.
   - Two indexers are *safe* for the data, because event application is idempotent
     (`INSERT OR IGNORE` on the event id). They just double the RPC load for no
     benefit.
   - Two notifiers are **not** safe. Each one reads `reminded_* = 0` rows, sends the
     reminder, and only then marks the row as sent. Two notifiers running at once
     will send duplicate emails and webhooks.
   - Use `replicas: 1`, a single systemd unit, or a single machine. Never autoscale.
3. **The `api/*` routes need the database file.** If you deploy the frontend to
   Vercel, its serverless functions have an empty, ephemeral filesystem. They will
   not see the indexer's database. On Vercel:
   - `api/indexer-*` return errors, and the frontend falls back to direct RPC as
     described in [data-sourcing.md](./data-sourcing.md). Site-wide stats show
     zeros.
   - `api/notifications/*` write subscriptions to a throwaway database that the
     notifier never reads.

   For a working deployment, serve `api/*` from the same host as the indexer, then
   point the frontend at it with `VITE_API_BASE`. The repo has **no standalone HTTP
   server** for `api/*` yet. You need a small adapter, such as an Express or Hono app
   that mounts each `handler` at its path, until one is added.

---

## 2. Configuration

All variables are documented in `.env.example`. These are the ones the backend reads:

| Variable | Used by | Required | Default | Notes |
|---|---|---|---|---|
| `LOCK_INDEX_DB_PATH` | all | **yes in prod** | `lock-index.sqlite`, relative to the working directory | Use an absolute path on a persistent volume, e.g. `/data/lock-index.sqlite` |
| `SOROBAN_RPC_URL` | indexer | yes for mainnet | `https://soroban-testnet.stellar.org` | Use a provider with enough event retention; see [§6](#recovery) |
| `TOKEN_LOCKER_CONTRACT` | indexer | **yes** | empty | The indexer filters on these. If both are empty, nothing is indexed |
| `LP_LOCKER_CONTRACT` | indexer | **yes** | empty | |
| `INDEXER_POLL_INTERVAL_MS` | indexer | no | `10000` | |
| `INDEXER_RPC_TIMEOUT_MS` | indexer | no | `15000` | Per RPC call |
| `RESEND_API_KEY` | notifier | for email | empty | When empty, emails are **skipped** with a warning in the log, not queued |
| `EMAIL_FROM` | notifier | no | `StellarLock <notify@stellarlock.xyz>` | Must be a sender verified in Resend |
| `WEBHOOK_SECRET` | notifier | for webhooks | empty | HMAC key for signing webhook bodies |
| `NOTIFIER_INTERVAL_MS` | notifier | no | `3600000` (1h) | |
| `PUBLIC_APP_URL` | notifier | no | `https://app.stellarlock.xyz` | Used for links in the emails |

Keep `RESEND_API_KEY` and `WEBHOOK_SECRET` in your platform's secret store. Don't
commit them to an `.env.*` file.

> Contract IDs differ per network. Take them from the same place as the frontend's
> `VITE_TOKEN_LOCKER_CONTRACT` / `VITE_LP_LOCKER_CONTRACT`. If the indexer points at
> different contracts than the UI, the explorer shows the wrong locks without any
> error.

---

## 3. Option A: Docker Compose on a single VM

This is the recommended default. `docker-compose.yml` already defines `indexer` and
`notifier` under the `backend` profile, sharing the `indexer-data` volume at `/data`.

### Setup

```bash
git clone https://github.com/StellarLock/StellarLock.git && cd StellarLock
cp .env.mainnet .env            # or .env.testnet
# then edit .env: TOKEN_LOCKER_CONTRACT, LP_LOCKER_CONTRACT, SOROBAN_RPC_URL,
# RESEND_API_KEY, EMAIL_FROM, WEBHOOK_SECRET, PUBLIC_APP_URL

docker compose --profile backend build
docker compose --profile backend up -d indexer notifier
```

### Production hardening

The compose services are built for development: they bind-mount the source tree
(`.:/app`) and run on the dev image. For production, add a
`docker-compose.prod.yml` override so the running code is the code baked into the
image:

```yaml
services:
  indexer:
    volumes: !override
      - indexer-data:/data
    restart: always
    logging: &logging
      driver: json-file
      options: { max-size: "20m", max-file: "5" }
  notifier:
    volumes: !override
      - indexer-data:/data
    restart: always
    logging: *logging
```

`Dockerfile.dev` doesn't `COPY` the source. Before using that override, add
`COPY . .` after the install layer, either in `Dockerfile.dev` or in a dedicated
`Dockerfile.backend`. Run with:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile backend up -d indexer notifier
```

Keep the base image patched. See
[issue #1160](./issue-1160-dependabot-docker.md) for the Dependabot entry that
handles this.

### Where things live

| What | Location |
|---|---|
| Database | Docker volume `stellarlock_indexer-data`, mounted at `/data/lock-index.sqlite` inside both containers. On the host it's under `docker volume inspect stellarlock_indexer-data --format '{{.Mountpoint}}'` |
| Logs | stdout/stderr: `docker compose logs -f indexer notifier` |

---

## 4. Option B: hosted platform with a persistent volume

Any platform that runs long-lived containers **and** attaches a block volume to
exactly one instance works, for example Fly.io Machines with a volume, Railway with
a volume, or Render with a persistent disk. The setup is the same everywhere:

1. **One service, two processes, one volume.** The indexer and notifier must share
   the database file. Most platforms give each service its own disk, so run both in
   a *single* service, for example with this `Procfile`-style command:
   ```bash
   sh -c 'pnpm indexer:start & pnpm notifier:start & wait -n; exit 1'
   ```
   `wait -n; exit 1` makes the container exit when either process dies, so the
   platform restarts both instead of leaving a half-dead service running.
   A small supervisor such as `tini` plus `concurrently --kill-others` also works.
2. **Mount the volume** at `/data` and set `LOCK_INDEX_DB_PATH=/data/lock-index.sqlite`.
3. **Pin to one instance.** Disable autoscaling, set min = max = 1, and disable
   zero-downtime/blue-green deploys that briefly run two copies. If the platform
   can't avoid overlap, the notifier may send a duplicate reminder during each
   deploy. Pick a platform that stops the old instance before starting the new one.
4. **Region.** Put it near your RPC provider. Every poll is a round trip.
5. **Serve `api/*` from this same service** (see constraint 3 in §1) and set
   `VITE_API_BASE` in the frontend build to its public URL.

> **Plain VM without Docker.** Run both under systemd with `Restart=always` and
> `WorkingDirectory=` set to the checkout. Set `Environment=LOCK_INDEX_DB_PATH=/var/lib/stellarlock/lock-index.sqlite`
> and `EnvironmentFile=/etc/stellarlock.env`. Logs go to `journalctl -u stellarlock-indexer -f`.

---

## 5. Monitoring and health checks

Neither worker exposes an HTTP health endpoint. `api/health.ts` only checks RPC and
Horizon reachability, not the indexer. Monitor the processes through the database
and the logs.

### Indexer lag (primary signal)

The indexer records progress in `index_meta`:

```bash
sqlite3 /data/lock-index.sqlite \
  "SELECT key, value FROM index_meta WHERE key IN ('last_indexed_ledger','cursor');"
```

Compare `last_indexed_ledger` with the network's latest ledger:

```bash
curl -s -X POST "$SOROBAN_RPC_URL" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' | jq .result.sequence
```

Stellar closes a ledger about every 5 seconds. Suggested alert thresholds:

| Lag (ledgers) | Approx. time | Meaning |
|---|---|---|
| < 10 | < 1 min | Healthy |
| 10–120 | 1–10 min | Degraded: check RPC errors in the log |
| > 120, or not advancing across 3 checks | > 10 min | **Page.** Indexer stuck or down |

A container healthcheck that fails when the database hasn't been written recently is
a cheap first step:

```yaml
    healthcheck:
      test: ["CMD-SHELL", "test $$(( $$(date +%s) - $$(stat -c %Y /data/lock-index.sqlite-wal 2>/dev/null || echo 0) )) -lt 600"]
      interval: 60s
      retries: 3
```

This only shows that *something* wrote to the database in the last 10 minutes. Treat
it as a liveness check and the ledger-lag check above as the real health check.

### Notifier

- Each run that has work logs `[notifier] dispatching N reminder(s)` and then
  `[notifier] done`. Runs with nothing due log nothing.
- Alert on `[notifier] Resend error` and `[notifier] webhook … failed`. These
  failures are **not retried**: `dispatchJob` marks the tier as sent whatever the
  delivery outcome, so a Resend outage loses those reminders.
- `RESEND_API_KEY not set — skipping email` in production means the secret is
  missing. Emails for that tier are **not retried** after the key is added, because
  the tier is marked as sent.
- Backlog of pending subscriptions:
  ```sql
  SELECT COUNT(*) FROM notification_subscriptions WHERE reminded_0d = 0;
  ```

### Log lines to alert on

| Log line | Meaning | Action |
|---|---|---|
| `[indexer] poll failed:` (repeated) | RPC down, timing out, or rate-limiting | Check the provider, `INDEXER_RPC_TIMEOUT_MS` and quotas |
| `[indexer] cursor rejected by RPC, clearing it…` | Cursor expired, auto-recovering | None, unless it repeats. See §6 |
| `[indexer] failed to process event <id>:` | One event couldn't be decoded; it was skipped | File a bug with the event id. The lock may be wrong in the index |
| `SQLITE_BUSY` / `database is locked` | Lock contention, or a backup holding a write lock | Check for a stray second process or a long-running backup |
| `SQLITE_CORRUPT` / `file is not a database` | Corruption | Restore from backup (§6) |

---

## 6. Backups

The database is in **WAL mode**. Copying only `lock-index.sqlite` while the
processes are running can produce a backup that is inconsistent or missing data.
Use SQLite's online backup instead:

```bash
# Consistent hot backup; safe while indexer/notifier are running
sqlite3 /data/lock-index.sqlite ".backup '/backups/lock-index-$(date +%F-%H%M).sqlite'"
# or: sqlite3 /data/lock-index.sqlite "VACUUM INTO '/backups/lock-index-$(date +%F).sqlite'"
```

With Docker Compose, run it in a throwaway container on the same volume:

```bash
docker run --rm -v stellarlock_indexer-data:/data -v "$PWD/backups:/backups" \
  keinos/sqlite3 sqlite3 /data/lock-index.sqlite ".backup '/backups/lock-index.sqlite'"
```

**What needs backing up?**

- `notification_subscriptions` is the **only data that can't be rebuilt.** It holds
  user emails and webhooks, and is not on-chain. Back it up at least daily and
  store backups off-host.
- `locks`, `lock_events` and `index_meta` can in principle be rebuilt from chain
  events, but only within the RPC node's retention window. A recent backup is far
  cheaper than a re-index.

Encrypt backups. They contain subscriber email addresses.

---

<a id="recovery"></a>
## 7. Recovery

### How the indexer resumes

On each poll (see `pollOnce` in `indexer/index.ts`):

1. If `index_meta.cursor` is set, it resumes from the cursor.
2. Otherwise, if `index_meta.last_indexed_ledger` is set, it resumes from
   `last_indexed_ledger + 1`.
3. **Otherwise it starts from the RPC's *latest* ledger.** This means a brand-new or
   wiped database indexes **only new events from now on**, with no history.

### Lost or expired cursor

**Recovery is automatic.** When the RPC rejects a stored cursor, the indexer logs
`cursor rejected by RPC`, deletes the cursor, and resumes from
`last_indexed_ledger + 1` on the next poll. Replayed events are deduplicated, so no
lock is double-counted.

If you deleted the cursor by hand, the indexer resumes the same way. Nothing else is
needed.

The resume fails only when `last_indexed_ledger + 1` is **older than the RPC's
retention window**, for example when the indexer was down longer than the provider
keeps events. Public Soroban RPC keeps roughly 7 days; check your provider. The
indexer then logs `poll failed` on every tick. To recover:

1. Restore the most recent backup whose `last_indexed_ledger` is inside the window,
   **or**
2. Accept a gap: set `last_indexed_ledger` to the oldest ledger the RPC still serves
   (`getLatestLedger().sequence − retention`), restart, and then reconcile the
   locks created during the gap from on-chain state.

### Lost database (volume deleted or corrupted)

1. Stop both workers: `docker compose --profile backend stop indexer notifier`.
2. Restore the latest backup to `LOCK_INDEX_DB_PATH`. Delete any leftover `-wal` and
   `-shm` files next to it first.
3. Start the workers. `initDb()` migrates older backups automatically; see
   [issue #1163](./issue-1163-db-migration-smoke-tests.md). The indexer then catches
   up from the backup's `last_indexed_ledger`.

**No backup available.** Seed the starting point **before** the first start.
Otherwise the indexer jumps to the latest ledger and skips all history:

```bash
sqlite3 /data/lock-index.sqlite \
  "CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   INSERT OR REPLACE INTO index_meta VALUES ('last_indexed_ledger', '<CONTRACT_DEPLOY_LEDGER - 1>');"
```

This fully rebuilds the index only if the contracts' deploy ledger is still inside
the RPC retention window. Otherwise, locks older than the window are missing from
the index; the frontend still shows them on per-token pages through the RPC
fallback. Subscriptions cannot be recovered without a backup. Affected users will
need to subscribe again.

### Duplicate reminders after an incident

If two notifiers ran at the same time (constraint 2 in §1), stop one. No data cleanup
is needed. The `reminded_*` flags end up correct, but some users got a duplicate.

---

## 8. Deploy checklist

- [ ] `LOCK_INDEX_DB_PATH` is an absolute path on a persistent, local, single-host volume
- [ ] `TOKEN_LOCKER_CONTRACT` / `LP_LOCKER_CONTRACT` match the frontend's network
- [ ] Exactly one indexer and one notifier; autoscaling and overlapping deploys disabled
- [ ] `RESEND_API_KEY`, `EMAIL_FROM` (verified sender) and `WEBHOOK_SECRET` set as secrets
- [ ] `api/*` served from the same host and `VITE_API_BASE` set in the frontend build
- [ ] Ledger-lag alert and log alerts configured
- [ ] Daily, encrypted, off-host `.backup` of the database, with a restore tested once
- [ ] For a fresh database: `last_indexed_ledger` seeded before first start
