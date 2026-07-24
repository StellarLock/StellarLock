import Database from 'better-sqlite3'

// Minimal SQLite DB backend for persistent index state.
// File-based DB so the indexer can resume after restarts.

const DB_PATH = process.env.LOCK_INDEX_DB_PATH || 'lock-index.sqlite'

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
      withdrawn INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_locks_token ON locks(token);
    CREATE INDEX IF NOT EXISTS idx_locks_beneficiary ON locks(beneficiary);
    CREATE INDEX IF NOT EXISTS idx_locks_creator ON locks(creator);
    CREATE INDEX IF NOT EXISTS idx_locks_unlock_at ON locks(unlock_at);

    CREATE TABLE IF NOT EXISTS lock_events (
      id TEXT PRIMARY KEY,
      ledger_seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      lock_id TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_lock_events_ledger ON lock_events(ledger_seq);

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
  `)
}

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM index_meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string) {
  db.prepare('INSERT INTO index_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
}

