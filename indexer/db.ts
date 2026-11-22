import Database from "better-sqlite3"

// Minimal SQLite DB backend for persistent index state.
// File-based DB so the indexer can resume after restarts.

const DB_PATH = process.env.LOCK_INDEX_DB_PATH || "lock-index.sqlite"

export const db = new Database(DB_PATH, {
  // Keep latency low; WAL improves concurrent read/write.
  fileMustExist: false,
})

export function initDb() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS index_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS locks (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      contract_id TEXT NOT NULL DEFAULT '',
      creator TEXT NOT NULL,
      beneficiary TEXT NOT NULL,
      token TEXT NOT NULL,
      token_a TEXT,
      token_b TEXT,
      dex TEXT,
      pool_share TEXT,
      amount TEXT NOT NULL,
      unlock_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      extended_count INTEGER DEFAULT 0,
      withdrawn INTEGER DEFAULT 0,
      released TEXT NOT NULL DEFAULT '0',
      vesting_start INTEGER,
      vesting_end INTEGER,
      description TEXT,
      project_url TEXT,
      logo_url TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_locks_token ON locks(token);
    CREATE INDEX IF NOT EXISTS idx_locks_beneficiary ON locks(beneficiary);
    CREATE INDEX IF NOT EXISTS idx_locks_creator ON locks(creator);
    CREATE INDEX IF NOT EXISTS idx_locks_unlock_at ON locks(unlock_at);
    -- Serves getStats()'s recentLocks (ORDER BY created_at DESC, id DESC LIMIT 10)
    -- straight from the index instead of a full-table sort. id is included
    -- because it's the tiebreaker and isn't the rowid (TEXT PRIMARY KEY).
    CREATE INDEX IF NOT EXISTS idx_locks_created_at ON locks(created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS lock_events (
      id TEXT PRIMARY KEY,
      ledger_seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      lock_id TEXT NOT NULL,
      tx_hash TEXT,
      ledger_closed_at INTEGER,
      payload TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_lock_events_ledger ON lock_events(ledger_seq);
    CREATE INDEX IF NOT EXISTS idx_lock_events_lock_id ON lock_events(lock_id);

    -- Events that failed to process are recorded here and retried on later
    -- polls (#1122): a transient DB error or decoding bug must never silently
    -- drop a lock state change, since the RPC cursor has already moved past it.
    CREATE TABLE IF NOT EXISTS failed_events (
      id TEXT PRIMARY KEY,
      ledger_seq INTEGER NOT NULL,
      event_type TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_failed_events_ledger ON failed_events(ledger_seq);

    CREATE TABLE IF NOT EXISTS contract_status (
      contract_id TEXT PRIMARY KEY,
      paused INTEGER NOT NULL DEFAULT 0,
      pending_upgrade_hash TEXT,
      pending_upgrade_execute_after INTEGER,
      last_upgrade_hash TEXT,
      admin TEXT,
      pending_admin TEXT,
      last_event TEXT,
      last_event_ledger INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS notification_subscriptions (
      id          TEXT PRIMARY KEY,
      lock_id     TEXT NOT NULL,
      address     TEXT NOT NULL,
      email       TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      email_verify_token_hash TEXT,
      email_verify_sent_at INTEGER,
      webhook_url TEXT,
      reminded_7d INTEGER DEFAULT 0,
      reminded_1d INTEGER DEFAULT 0,
      reminded_0d INTEGER DEFAULT 0,
      created_at  INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_subs_lock    ON notification_subscriptions(lock_id);
    CREATE INDEX IF NOT EXISTS idx_subs_pending ON notification_subscriptions(reminded_0d)
      WHERE reminded_0d = 0;
  `)

  // subscribe/unsubscribe look subscriptions up by the (address, lock_id)
  // pair, and the upsert logic assumes at most one row per pair. Databases
  // created before this index existed may hold duplicates (the upsert's
  // check-then-insert could race), which would make CREATE UNIQUE INDEX fail —
  // keep the most recently inserted row per pair before creating it. The
  // composite index's address prefix also covers address-only lookups, so the
  // old single-column idx_subs_address is dropped.
  const hasSubsPairIndex = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_subs_address_lock'`)
    .get()
  if (!hasSubsPairIndex) {
    db.transaction(() => {
      db.exec(`
        DELETE FROM notification_subscriptions
        WHERE rowid NOT IN (
          SELECT MAX(rowid) FROM notification_subscriptions GROUP BY address, lock_id
        );
        CREATE UNIQUE INDEX idx_subs_address_lock ON notification_subscriptions(address, lock_id);
        DROP INDEX IF EXISTS idx_subs_address;
      `)
    })()
  }

  // Double opt-in columns were added after notification_subscriptions first
  // shipped. Existing rows start unverified, so they only resume receiving
  // reminder emails once the address is confirmed via a fresh subscribe.
  const subColumns = db.prepare(`PRAGMA table_info(notification_subscriptions)`).all() as { name: string }[]
  if (!subColumns.some((c) => c.name === "email_verified")) {
    db.exec(`ALTER TABLE notification_subscriptions ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`)
  }
  if (!subColumns.some((c) => c.name === "email_verify_token_hash")) {
    db.exec(`ALTER TABLE notification_subscriptions ADD COLUMN email_verify_token_hash TEXT`)
  }
  if (!subColumns.some((c) => c.name === "email_verify_sent_at")) {
    db.exec(`ALTER TABLE notification_subscriptions ADD COLUMN email_verify_sent_at INTEGER`)
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_subs_verify_token ON notification_subscriptions(email_verify_token_hash)`,
  )

  // `released` was added after `locks` first shipped — back-fill it for
  // databases created before this column existed. Every already-indexed
  // lock defaulted to being marked fully withdrawn as soon as any withdrawal
  // was seen, so 0 is a safe starting point (the next withdrawal event, if
  // any, re-derives the correct cumulative total).
  const lockColumns = db.prepare(`PRAGMA table_info(locks)`).all() as { name: string }[]
  if (!lockColumns.some((c) => c.name === "released")) {
    db.exec(`ALTER TABLE locks ADD COLUMN released TEXT NOT NULL DEFAULT '0'`)
  }

  // Vesting schedule and project metadata columns — added for Issue #1130.
  // Populated asynchronously after a create event via a get_lock simulation.
  if (!lockColumns.some((c) => c.name === "vesting_start")) {
    db.exec(`ALTER TABLE locks ADD COLUMN vesting_start INTEGER`)
  }
  if (!lockColumns.some((c) => c.name === "vesting_end")) {
    db.exec(`ALTER TABLE locks ADD COLUMN vesting_end INTEGER`)
  }
  if (!lockColumns.some((c) => c.name === "description")) {
    db.exec(`ALTER TABLE locks ADD COLUMN description TEXT`)
  }
  if (!lockColumns.some((c) => c.name === "project_url")) {
    db.exec(`ALTER TABLE locks ADD COLUMN project_url TEXT`)
  }
  if (!lockColumns.some((c) => c.name === "logo_url")) {
    db.exec(`ALTER TABLE locks ADD COLUMN logo_url TEXT`)
  }

  // lock_events enrichment columns — added for Issue #1129.
  const eventColumns = db.prepare(`PRAGMA table_info(lock_events)`).all() as { name: string }[]
  if (!eventColumns.some((c) => c.name === "tx_hash")) {
    db.exec(`ALTER TABLE lock_events ADD COLUMN tx_hash TEXT`)
  }
  if (!eventColumns.some((c) => c.name === "ledger_closed_at")) {
    db.exec(`ALTER TABLE lock_events ADD COLUMN ledger_closed_at INTEGER`)
  }
  if (!eventColumns.some((c) => c.name === "payload")) {
    db.exec(`ALTER TABLE lock_events ADD COLUMN payload TEXT`)
  }

  // Index to serve GET /api/indexer-lock-events?lockId= efficiently.
  // CREATE INDEX IF NOT EXISTS is idempotent — safe to run on every startup.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lock_events_lock_id ON lock_events(lock_id)`)

  // contract_id on locks — added for Issue #1127 (namespace by contract address).
  // Rows created before this column existed keep the empty-string default;
  // they will be re-indexed with the correct contract_id when the events are
  // replayed, or operators can clear the DB and let the indexer re-index from
  // the beginning.
  if (!lockColumns.some((c) => c.name === "contract_id")) {
    db.exec(`ALTER TABLE locks ADD COLUMN contract_id TEXT NOT NULL DEFAULT ''`)
  }

  // contract_id on lock_events — mirrors the locks column for join/filter use.
  if (!eventColumns.some((c) => c.name === "contract_id")) {
    db.exec(`ALTER TABLE lock_events ADD COLUMN contract_id TEXT NOT NULL DEFAULT ''`)
  }
}

export function getMeta(key: string): string | null {
  const row = db.prepare("SELECT value FROM index_meta WHERE key = ?").get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string) {
  db.prepare("INSERT INTO index_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(
    key,
    value,
  )
}

export function deleteMeta(key: string) {
  db.prepare("DELETE FROM index_meta WHERE key = ?").run(key)
}
