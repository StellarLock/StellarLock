import { pathToFileURL } from "node:url"
import { Server } from "@stellar/stellar-sdk/rpc"
import { scValToNative, xdr, Contract, TransactionBuilder, BASE_FEE, Networks, nativeToScVal } from "@stellar/stellar-sdk"
import { initDb, db, getMeta, setMeta, deleteMeta } from "./db"
import { createBackendLogger } from "./logger"

const log = createBackendLogger("indexer")

export interface IndexedLock {
  id: string
  kind: "token" | "lp"
  /** The contract address that created this lock (token-locker or lp-locker). */
  contractId: string
  creator: string
  beneficiary: string
  token: string
  token_a?: string | null
  token_b?: string | null
  dex?: string | null
  pool_share?: string | null
  amount: bigint
  /** Cumulative amount released across all withdrawals so far (== amount once fully withdrawn). */
  released: bigint
  unlockAt: number
  status: "locked" | "withdrawn"
  createdAt: number
  extendedCount?: number
  withdrawn?: boolean
  /** Vesting schedule start (unix seconds), null if no vesting. */
  vestingStart?: number | null
  /** Vesting schedule end (unix seconds), null if no vesting. */
  vestingEnd?: number | null
  description?: string | null
  projectUrl?: string | null
  logoUrl?: string | null
}

interface AggregateStats {
  totalLocks: number
  uniqueTokens: number
  recentLocks: IndexedLock[]
  upcomingUnlocks: IndexedLock[]
  lastIndexedLedger: number
  latestLedger: number
  lagLedgers: number
  contractStatus: ContractStatus[]
}

const RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org"
const TOKEN_LOCKER_ID = process.env.TOKEN_LOCKER_CONTRACT || ""
const LP_LOCKER_ID = process.env.LP_LOCKER_CONTRACT || ""
const POLL_INTERVAL_MS = Number(process.env.INDEXER_POLL_INTERVAL_MS || 10_000)
const EVENTS_PAGE_LIMIT = 100
/** Max time to wait for a single Soroban RPC call before treating it as failed. */
const RPC_CALL_TIMEOUT_MS = Number(process.env.INDEXER_RPC_TIMEOUT_MS || 15_000)
/**
 * Ledger to start indexing from on the very first run, before any cursor or
 * `last_indexed_ledger` has been recorded. Set it to the locker contracts'
 * deploy ledger (record it in contracts/registry.json) so a fresh indexer
 * backfills every existing lock instead of starting at the chain tip and
 * missing them. 0 (unset) keeps the historical behaviour of starting at the
 * RPC's latest ledger. See docs/indexer-architecture.md → "Backfill".
 */
const INDEXER_START_LEDGER = Number(process.env.INDEXER_START_LEDGER || 0)
/**
 * Max attempts to reprocess a recorded failed event before leaving it for
 * operator investigation (the count is still surfaced via the health endpoint).
 */
const FAILED_EVENT_MAX_ATTEMPTS = 5

const META_CURSOR = "cursor"
const META_LAST_LEDGER = "last_indexed_ledger"
const META_LATEST_LEDGER = "latest_network_ledger"

let dbReady = false
function ensureDb() {
  if (!dbReady) {
    initDb()
    dbReady = true
  }
}

interface LockRow {
  id: string
  kind: string
  contract_id: string
  creator: string
  beneficiary: string
  token: string
  token_a: string | null
  token_b: string | null
  dex: string | null
  pool_share: string | null
  amount: string
  released: string
  unlock_at: number
  status: string
  created_at: number
  extended_count: number
  withdrawn: number
  vesting_start: number | null
  vesting_end: number | null
  description: string | null
  project_url: string | null
  logo_url: string | null
}

function buildStatements() {
  return {
    upsertLock: db.prepare(`
      INSERT INTO locks (id, kind, contract_id, creator, beneficiary, token, token_a, token_b, dex, pool_share, amount, unlock_at, status, created_at)
      VALUES (@id, @kind, @contract_id, @creator, @beneficiary, @token, @token_a, @token_b, @dex, @pool_share, @amount, @unlock_at, 'locked', @created_at)
      ON CONFLICT(id) DO UPDATE SET
        creator = excluded.creator,
        beneficiary = excluded.beneficiary,
        token = excluded.token,
        token_a = excluded.token_a,
        token_b = excluded.token_b,
        dex = excluded.dex,
        pool_share = excluded.pool_share,
        amount = excluded.amount,
        unlock_at = excluded.unlock_at
    `),
    getAmountAndReleased: db.prepare(`SELECT amount, released FROM locks WHERE id = ?`),
    recordRelease: db.prepare(`
      UPDATE locks SET released = @released, status = @status, withdrawn = @withdrawn WHERE id = @id
    `),
    extendUnlock: db.prepare(`UPDATE locks SET unlock_at = ?, extended_count = extended_count + 1 WHERE id = ?`),
    // After an extension, re-arm any reminder whose threshold is now in the
    // future again, so subscribers are reminded about the new unlock date
    // (and aren't left believing the lock already unlocked). Thresholds match
    // the notifier's: a tier fires once seconds-until-unlock is <= its window.
    rearmReminders: db.prepare(`
      UPDATE notification_subscriptions SET
        reminded_7d = CASE WHEN @unlock_at - @now > ${7 * 86_400} THEN 0 ELSE reminded_7d END,
        reminded_1d = CASE WHEN @unlock_at - @now > 86400 THEN 0 ELSE reminded_1d END,
        reminded_0d = CASE WHEN @unlock_at - @now > 0 THEN 0 ELSE reminded_0d END
      WHERE lock_id = @lock_id
    `),
    setBeneficiary: db.prepare(`UPDATE locks SET beneficiary = ? WHERE id = ?`),
    insertEvent: db.prepare(
      `INSERT OR IGNORE INTO lock_events (id, ledger_seq, event_type, lock_id, contract_id, tx_hash, ledger_closed_at, payload)
       VALUES (@id, @ledger_seq, @event_type, @lock_id, @contract_id, @tx_hash, @ledger_closed_at, @payload)`,
    ),
    setLockMeta: db.prepare(`
      UPDATE locks SET
        vesting_start = @vesting_start,
        vesting_end   = @vesting_end,
        description   = @description,
        project_url   = @project_url,
        logo_url      = @logo_url
      WHERE id = @id
    `),
  }
}

let statements: ReturnType<typeof buildStatements> | null = null

function stmts() {
  ensureDb()
  statements ??= buildStatements()
  return statements
}

function rowToLock(row: LockRow): IndexedLock {
  return {
    id: row.id,
    kind: row.kind as "token" | "lp",
    contractId: row.contract_id,
    creator: row.creator,
    beneficiary: row.beneficiary,
    token: row.token,
    token_a: row.token_a,
    token_b: row.token_b,
    dex: row.dex,
    pool_share: row.pool_share,
    amount: BigInt(row.amount),
    released: BigInt(row.released),
    unlockAt: row.unlock_at,
    status: row.status as "locked" | "withdrawn",
    createdAt: row.created_at,
    extendedCount: row.extended_count,
    withdrawn: row.withdrawn === 1,
    vestingStart: row.vesting_start ?? null,
    vestingEnd: row.vesting_end ?? null,
    description: row.description ?? null,
    projectUrl: row.project_url ?? null,
    logoUrl: row.logo_url ?? null,
  }
}

/**
 * A contract event with topics/data already decoded from ScVal to native JS
 * values (bigint for u64/i128, string for Symbol/Address).
 */
export interface ContractEvent {
  /** Unique RPC event id — used to deduplicate replayed ranges. */
  id: string
  /** Contract that emitted the event, supplied by Soroban getEvents. */
  contractId?: string
  /** The contract address that emitted this event. Used to namespace lock ids. */
  contractId: string
  ledger: number
  /** Ledger close time (unix seconds); used as the lock's created_at. */
  timestamp?: number
  /** ISO-8601 ledger close time string from the RPC response. */
  ledgerClosedAt?: string
  /** Transaction hash for the transaction that emitted this event. */
  txHash?: string
  topics: unknown[]
  data: unknown
}

/**
 * Apply one `lock_withdrawn` event's releasable amount to a lock's
 * cumulative `released` total, marking it fully withdrawn only once that
 * total reaches the lock's full amount. A lock with a linear vesting
 * schedule can emit several `lock_withdrawn` events — one per partial claim
 * — each carrying only the amount released in that particular withdrawal,
 * not the lock's total, so a single such event is never enough on its own
 * to tell whether the lock is now fully withdrawn.
 */
function applyRelease(s: ReturnType<typeof buildStatements>, lockId: string, releasable: bigint) {
  const row = s.getAmountAndReleased.get(lockId) as { amount: string; released: string } | undefined
  if (!row) return // withdrawal for a lock we never indexed a creation event for
  const released = BigInt(row.released) + releasable
  const fullyWithdrawn = released >= BigInt(row.amount)
  s.recordRelease.run({
    id: lockId,
    released: released.toString(),
    status: fullyWithdrawn ? "withdrawn" : "locked",
    withdrawn: fullyWithdrawn ? 1 : 0,
  })
}

export interface ContractStatus {
  contractId: string
  paused: boolean
  pendingUpgradeHash: string | null
  pendingUpgradeExecuteAfter: number | null
  lastUpgradeHash: string | null
  admin: string | null
  pendingAdmin: string | null
  lastEvent: string | null
  lastEventLedger: number | null
}

const STATUS_EVENTS = new Set([
  "contract_paused",
  "contract_unpaused",
  "upgrade_proposed",
  "upgrade_executed",
  "upgrade_cancelled",
  "admin_proposed",
  "admin_accepted",
  "contract_initialized",
])

function bytesToHex(value: unknown): string | null {
  if (typeof value === "string") return value
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex")
  return null
}

function recordContractStatus(event: ContractEvent, name: string): void {
  const contractId = event.contractId
  if (!contractId) return

  db.prepare(
    `INSERT INTO contract_status (contract_id, last_event, last_event_ledger)
     VALUES (?, ?, ?)
     ON CONFLICT(contract_id) DO UPDATE SET last_event = excluded.last_event,
       last_event_ledger = excluded.last_event_ledger, updated_at = unixepoch()`,
  ).run(contractId, name, event.ledger)

  const topic = (index: number) => event.topics[index]
  switch (name) {
    case "contract_paused":
      db.prepare("UPDATE contract_status SET paused = 1, updated_at = unixepoch() WHERE contract_id = ?").run(contractId)
      break
    case "contract_unpaused":
      db.prepare("UPDATE contract_status SET paused = 0, updated_at = unixepoch() WHERE contract_id = ?").run(contractId)
      break
    case "upgrade_proposed":
      db.prepare(
        `UPDATE contract_status
         SET pending_upgrade_hash = ?, pending_upgrade_execute_after = ?, updated_at = unixepoch()
         WHERE contract_id = ?`,
      ).run(bytesToHex(topic(2)), Number(topic(1)), contractId)
      break
    case "upgrade_executed": {
      const hash = bytesToHex(topic(2))
      db.prepare(
        `UPDATE contract_status
         SET pending_upgrade_hash = NULL, pending_upgrade_execute_after = NULL,
             last_upgrade_hash = ?, updated_at = unixepoch()
         WHERE contract_id = ?`,
      ).run(hash, contractId)
      break
    }
    case "upgrade_cancelled":
      db.prepare(
        `UPDATE contract_status
         SET pending_upgrade_hash = NULL, pending_upgrade_execute_after = NULL,
             updated_at = unixepoch()
         WHERE contract_id = ?`,
      ).run(contractId)
      break
    case "admin_proposed":
      db.prepare("UPDATE contract_status SET pending_admin = ?, updated_at = unixepoch() WHERE contract_id = ?").run(
        String(topic(1)),
        contractId,
      )
      break
    case "admin_accepted":
    case "contract_initialized":
      db.prepare(
        "UPDATE contract_status SET admin = ?, pending_admin = NULL, updated_at = unixepoch() WHERE contract_id = ?",
      ).run(String(topic(1)), contractId)
      break
  }
}

export function getContractStatuses(): ContractStatus[] {
  ensureDb()
  const rows = db.prepare("SELECT * FROM contract_status ORDER BY contract_id").all() as Array<{
    contract_id: string
    paused: number
    pending_upgrade_hash: string | null
    pending_upgrade_execute_after: number | null
    last_upgrade_hash: string | null
    admin: string | null
    pending_admin: string | null
    last_event: string | null
    last_event_ledger: number | null
  }>
  return rows.map((row) => ({
    contractId: row.contract_id,
    paused: row.paused === 1,
    pendingUpgradeHash: row.pending_upgrade_hash,
    pendingUpgradeExecuteAfter: row.pending_upgrade_execute_after,
    lastUpgradeHash: row.last_upgrade_hash,
    admin: row.admin,
    pendingAdmin: row.pending_admin,
    lastEvent: row.last_event,
    lastEventLedger: row.last_event_ledger,
  }))
/** Apply a lock extension and re-arm reminders whose thresholds moved back into the future. */
function extendLock(s: ReturnType<typeof buildStatements>, lockId: string, newUnlockAt: number) {
  s.extendUnlock.run(newUnlockAt, lockId)
  s.rearmReminders.run({ lock_id: lockId, unlock_at: newUnlockAt, now: Math.floor(Date.now() / 1000) })
}

/**
 * Parse a locker contract event and upsert it into the SQLite index.
 * Token-locker events carry their payload in the topics; lp-locker
 * withdraw/extend/transfer events carry it in the data tuple.
 * Already-seen event ids are skipped so replays are idempotent.
 *
 * Returns the lock id string of a newly-created lock (token or LP) so that
 * the caller can kick off an async `get_lock` simulation to back-fill vesting
 * schedule and metadata (Issue #1130). Returns `undefined` for all other events.
 */
export function processEvent(event: ContractEvent): string | undefined {
  const name = typeof event.topics[0] === "string" ? event.topics[0] : undefined
  if (!name) return

  const s = stmts()
  const createdAt = event.timestamp ?? Math.floor(Date.now() / 1000)
  const ledgerClosedAt = event.timestamp ?? null
  const txHash = event.txHash ?? null
  const payload = JSON.stringify({ topics: event.topics, data: event.data })

  // Lock ids are namespaced by the emitting contract address so that two
  // deployments restarting their counters at the same value cannot collide.
  // Format: "<contractAddr>:<numericId>", e.g. "CXXX…:1042".
  const mkLockId = (numericId: unknown) => `${event.contractId}:${String(numericId)}`

  /** Build the named-param object for insertEvent. */
  const eventParams = (lid: string) => ({
    id: event.id,
    ledger_seq: event.ledger,
    event_type: name,
    lock_id: lid,
    contract_id: event.contractId,
    tx_hash: txHash,
    ledger_closed_at: ledgerClosedAt,
    payload,
  })

  let newlyCreatedLockId: string | undefined

  const apply = db.transaction(() => {
    if (STATUS_EVENTS.has(name)) {
      const statusLockId = `contract:${event.contractId ?? "unknown"}`
      if (!s.insertEvent.run(event.id, event.ledger, name, statusLockId).changes) return
      recordContractStatus(event, name)
      return
    }

    switch (name) {
      case "lock_created": {
        const [, id, creator, token, amount, beneficiary, unlockAt] = event.topics
        const lid = mkLockId(id)
        if (!s.insertEvent.run(eventParams(lid)).changes) return
        s.upsertLock.run({
          id: lid,
          kind: "token",
          contract_id: event.contractId,
          creator: String(creator),
          beneficiary: String(beneficiary),
          token: String(token),
          token_a: null,
          token_b: null,
          dex: null,
          pool_share: null,
          amount: String(amount),
          unlock_at: Number(unlockAt),
          created_at: createdAt,
        })
        newlyCreatedLockId = lid
        break
      }
      // Each split-group child now publishes its own `lock_created` event
      // (own id, beneficiary, amount) handled by the case above, including
      // the first child, whose id equals the group id. This event is only a
      // group-level summary — it must NOT upsert a lock row, since that
      // would clobber the correct per-child row (from the case above) with
      // the group's aggregate total and the creator standing in as
      // beneficiary.
      case "split_lock_created": {
        const [, groupId] = event.topics
        const lid = mkLockId(groupId)
        s.insertEvent.run(eventParams(lid))
        break
      }
      case "lock_withdrawn": {
        const [, id, , , releasable] = event.topics
        const lid = mkLockId(id)
        if (!s.insertEvent.run(eventParams(lid)).changes) return
        applyRelease(s, lid, BigInt(releasable as bigint))
        break
      }
      case "lock_extended": {
        const [, id, , , newUnlockAt] = event.topics
        const lid = mkLockId(id)
        if (!s.insertEvent.run(eventParams(lid)).changes) return
        s.extendUnlock.run(Number(newUnlockAt), lid)
        const lockId = `token:${String(id)}`
        if (!s.insertEvent.run(event.id, event.ledger, name, lockId).changes) return
        extendLock(s, lockId, Number(newUnlockAt))
        break
      }
      case "beneficiary_transferred": {
        const [, id, , newBeneficiary] = event.topics
        const lid = mkLockId(id)
        if (!s.insertEvent.run(eventParams(lid)).changes) return
        s.setBeneficiary.run(String(newBeneficiary), lid)
        break
      }
      case "lp_lock_created": {
        const [, id, creator, poolShare, amount, beneficiary, unlockAt] = event.topics
        const lid = mkLockId(id)
        if (!s.insertEvent.run(eventParams(lid)).changes) return
        // The contract emits (dex, token_a, token_b) as the event data tuple.
        // scValToNative converts a Soroban enum variant like Dex::Aquarius to
        // { Aquarius: {} }, so extract the first key as the dex name string.
        const [dex, tokenA, tokenB] = Array.isArray(event.data) ? (event.data as unknown[]) : []
        const dexStr =
          dex != null && typeof dex === "object" ? (Object.keys(dex)[0] ?? null) : typeof dex === "string" ? dex : null
        s.upsertLock.run({
          id: lid,
          kind: "lp",
          contract_id: event.contractId,
          creator: String(creator),
          beneficiary: String(beneficiary),
          token: String(poolShare),
          token_a: typeof tokenA === "string" ? tokenA : null,
          token_b: typeof tokenB === "string" ? tokenB : null,
          dex: dexStr,
          pool_share: String(poolShare),
          amount: String(amount),
          unlock_at: Number(unlockAt),
          created_at: createdAt,
        })
        newlyCreatedLockId = lid
        break
      }
      case "lp_lock_withdrawn": {
        // Contract emits topics=(symbol, id), data=(beneficiary, pool_share, releasable).
        // A vesting LP lock can emit several of these (one per partial claim),
        // so cumulative tracking via applyRelease is required — unconditionally
        // marking "withdrawn" here would wrongly close out a lock after its
        // first partial claim.
        const [, id] = event.topics
        const [, , releasable] = event.data as unknown[]
        const lid = mkLockId(id)
        if (!s.insertEvent.run(eventParams(lid)).changes) return
        applyRelease(s, lid, BigInt(releasable as bigint))
        break
      }
      case "lp_lock_extended": {
        // Contract emits topics=(symbol, id), data=(creator, old_unlock_at, new_unlock_at).
        const [, id] = event.topics
        const [, , newUnlockAt] = event.data as unknown[]
        const lid = mkLockId(id)
        if (!s.insertEvent.run(eventParams(lid)).changes) return
        s.extendUnlock.run(Number(newUnlockAt), lid)
        const lockId = `lp:${String(id)}`
        if (!s.insertEvent.run(event.id, event.ledger, name, lockId).changes) return
        extendLock(s, lockId, Number(newUnlockAt))
        break
      }
      case "lp_beneficiary_transferred": {
        // Contract emits topics=(symbol, id), data=(old_beneficiary, new_beneficiary).
        const [, id] = event.topics
        const [, newBeneficiary] = event.data as unknown[]
        const lid = mkLockId(id)
        if (!s.insertEvent.run(eventParams(lid)).changes) return
        s.setBeneficiary.run(String(newBeneficiary), lid)
        break
      }
      // Each split-group child now publishes its own `lp_lock_created` event
      // (own id, beneficiary, amount) handled by that case above, including
      // the first child, whose id equals the group id. This event is only a
      // group-level summary — it must NOT upsert a lock row, since that
      // would clobber the correct per-child row with the group's aggregate
      // total and the creator standing in as beneficiary.
      case "lp_split_lock_created": {
        const [, groupId] = event.topics
        const lid = mkLockId(groupId)
        s.insertEvent.run(eventParams(lid))
        break
      }
      default:
        // upgrade_proposed / upgrade_cancelled / unknown events — not lock state.
        return
    }
  })
  apply()
  return newlyCreatedLockId
}

// ---------------------------------------------------------------------------
// Issue #1130 — Vesting schedule + metadata back-fill via get_lock simulation
// ---------------------------------------------------------------------------

/** Minimal RPC server interface needed for get_lock simulations (injectable in tests). */
export interface SimulationServer {
  simulateTransaction(tx: unknown): Promise<{
    error?: string
    result?: { retval: xdr.ScVal }
  }>
}

/**
 * Simulate a `get_lock` call against TOKEN_LOCKER_ID and store the resulting
 * vesting schedule and project metadata on the already-indexed lock row.
 *
 * Uses a dummy source account (all-zeros public key) — the same approach the
 * frontend uses in `src/lib/stellar.ts`. The simulation never touches the
 * ledger so the source account need not actually exist.
 *
 * Runs outside any DB transaction; failures are logged and swallowed so a
 * failed metadata fetch never aborts the event that triggered it.
 */
export async function backfillLockMeta(
  lockId: string,
  server: SimulationServer,
): Promise<void> {
  // lockId is "<contractAddr>:<numericId>" for token locks — extract the parts.
  // LP lock ids share the same format but `get_lock` only exists on the
  // token-locker contract, so skip non-token locks.
  const match = /^([A-Z0-9]{56}):(\d+)$/.exec(lockId)
  if (!match) return

  const contractAddr = match[1]
  const numericId = match[2]

  // Only call get_lock on contracts that are known token-locker deployments.
  if (!TOKEN_LOCKER_ID || contractAddr !== TOKEN_LOCKER_ID) {
    // If a secondary token-locker contract address is ever added via env, it
    // would be listed here. For now a single TOKEN_LOCKER_CONTRACT is enough.
    return
  }

  try {
    const dummySource = {
      accountId: () => "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      sequenceNumber: () => "0",
      incrementSequenceNumber: () => {},
    }

    const networkPassphrase = process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET

    const contract = new Contract(contractAddr)
    const tx = new TransactionBuilder(dummySource as unknown as Parameters<typeof TransactionBuilder>[0], {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(contract.call("get_lock", nativeToScVal(BigInt(numericId), { type: "u64" })))
      .setTimeout(30)
      .build()

    const sim = await server.simulateTransaction(tx)
    if (!sim.result?.retval || (sim as { error?: string }).error) return

    const raw = scValToNative(sim.result.retval) as Record<string, unknown> | null
    if (!raw) return

    // Vesting: sentinel (start=0, end=0) means no vesting schedule.
    const vestingRaw = raw.vesting as { start: bigint; end: bigint } | null | undefined
    const hasVesting = vestingRaw != null && !(Number(vestingRaw.start) === 0 && Number(vestingRaw.end) === 0)

    // Metadata: empty strings mean "not set".
    const metaRaw = raw.metadata as { description: string; project_url: string; logo_url: string } | null | undefined

    stmts().setLockMeta.run({
      id: lockId,
      vesting_start: hasVesting ? Number(vestingRaw!.start) : null,
      vesting_end:   hasVesting ? Number(vestingRaw!.end)   : null,
      description:   metaRaw?.description  || null,
      project_url:   metaRaw?.project_url  || null,
      logo_url:      metaRaw?.logo_url     || null,
    })

    console.log(`[indexer] back-filled vesting/metadata for ${lockId}`)
  } catch (err) {
    console.warn(`[indexer] get_lock simulation failed for ${lockId}:`, err)
  }
}

// ---------------------------------------------------------------------------
// Issue #1129 — Lock event history query
// ---------------------------------------------------------------------------

export interface IndexedLockEvent {
  id: string
  ledger_seq: number
  event_type: string
  lock_id: string
  contract_id: string
  tx_hash: string | null
  ledger_closed_at: number | null
  payload: string | null
}

/**
 * Return all events for a given lock ordered oldest-first, suitable for
 * serving the GET /api/indexer-lock-events?lockId= endpoint.
 *
 * @param lockId - Canonical lock id (e.g. `"CXXX…:42"` or `"CYYY…:7"`).
 * @returns Events ordered by ledger_seq ASC, then id ASC.
 */
export function getLockEvents(lockId: string): IndexedLockEvent[] {
  ensureDb()
  return db
    .prepare(
      `SELECT id, ledger_seq, event_type, lock_id, contract_id, tx_hash, ledger_closed_at, payload
       FROM lock_events
       WHERE lock_id = ?
       ORDER BY ledger_seq ASC, id ASC`,
    )
    .all(lockId) as IndexedLockEvent[]
}

export function getStats(): AggregateStats {
  ensureDb()
  const now = Math.floor(Date.now() / 1000)

  const totals = db
    .prepare("SELECT COUNT(*) AS totalLocks, COUNT(DISTINCT token) AS uniqueTokens FROM locks")
    .get() as { totalLocks: number; uniqueTokens: number }

  const totalValue = (
    db.prepare("SELECT amount, released FROM locks WHERE status = 'locked'").all() as { amount: string; released: string }[]
  ).reduce((sum, r) => sum + BigInt(r.amount) - BigInt(r.released), BigInt(0))

  const recentLocks = (
    db.prepare("SELECT * FROM locks ORDER BY created_at DESC, id DESC LIMIT 10").all() as LockRow[]
  ).map(rowToLock)

  const upcomingUnlocks = (
    db
      .prepare("SELECT * FROM locks WHERE status = 'locked' AND unlock_at > ? ORDER BY unlock_at ASC LIMIT 10")
      .all(now) as LockRow[]
  ).map(rowToLock)

  return {
    totalLocks: totals.totalLocks,
    uniqueTokens: totals.uniqueTokens,
    recentLocks,
    upcomingUnlocks,
    lastIndexedLedger: getLastIndexed(),
    latestLedger: Number(getMeta(META_LATEST_LEDGER) ?? 0),
    lagLedgers: Math.max(Number(getMeta(META_LATEST_LEDGER) ?? 0) - getLastIndexed(), 0),
    contractStatus: getContractStatuses(),
  }
}

export function getLocksForToken(token: string): IndexedLock[] {
  ensureDb()
  const rows = db.prepare("SELECT * FROM locks WHERE token = ? ORDER BY created_at ASC").all(token) as LockRow[]
  return rows.map(rowToLock)
}

/**
 * Look up a single lock by its indexer-internal id (`${contractId}:${numericId}`,
 * see `mkLockId` above). Used as the by-id archival fallback (#1084): once a
 * withdrawn lock's on-chain TTL (`WITHDRAWN_BUMP`) lapses, `get_lock` on the
 * contract starts returning `None`, but the indexer's SQLite row for it is
 * never deleted, so history is still recoverable here.
 */
export function getLockById(id: string): IndexedLock | null {
  ensureDb()
  const row = db.prepare("SELECT * FROM locks WHERE id = ?").get(id) as LockRow | undefined
  return row ? rowToLock(row) : null
}

interface LockPage {
  locks: IndexedLock[]
  total: number
}

/** Paginated variant of getLocksForToken, for the HTTP API's lock-list endpoint. */
export function getLocksForTokenPage(token: string, offset = 0, limit = 50): LockPage {
  ensureDb()
  const { total } = db.prepare("SELECT COUNT(*) AS total FROM locks WHERE token = ?").get(token) as { total: number }
  const rows = db
    .prepare("SELECT * FROM locks WHERE token = ? ORDER BY created_at ASC LIMIT ? OFFSET ?")
    .all(token, limit, offset) as LockRow[]
  return { locks: rows.map(rowToLock), total }
}

export interface TokenAggregate {
  token: string
  lockCount: number
  totalLocked: bigint
}

/**
 * Per-token totals across all still-locked locks, sorted by amount locked
 * (descending). Powers cross-token views (e.g. "top tokens by TVL") that a
 * direct RPC client can't answer without iterating every lock.
 */
export function getTopTokens(limit = 50): TokenAggregate[] {
  ensureDb()
  const rows = db.prepare("SELECT token, amount, released FROM locks WHERE status = 'locked'").all() as {
    token: string
    amount: string
    released: string
  }[]

  const byToken = new Map<string, TokenAggregate>()
  for (const r of rows) {
    const entry = byToken.get(r.token) ?? { token: r.token, lockCount: 0, totalLocked: 0n }
    entry.lockCount++
    entry.totalLocked += BigInt(r.amount) - BigInt(r.released)
    byToken.set(r.token, entry)
  }

  return [...byToken.values()]
    .sort((a, b) => (a.totalLocked === b.totalLocked ? 0 : a.totalLocked < b.totalLocked ? 1 : -1))
    .slice(0, limit)
}

export function getLastIndexed(): number {
  ensureDb()
  return Number(getMeta(META_LAST_LEDGER) ?? 0)
}

// ---------------------------------------------------------------------------
// Failed-event recording & retry (#1122)
// ---------------------------------------------------------------------------

export interface FailedEventRecord {
  id: string
  ledgerSeq: number
  eventType: string | null
  attempts: number
  lastError: string | null
  lastAttemptAt: number
}

/**
 * Serialize a decoded contract event to JSON for later retry, turning bigint
 * fields (u64/i128 amounts) into strings. `processEvent` re-normalizes every
 * value through `String()` / `BigInt()` / `Number()` before using it, so the
 * round-trip indexes the event exactly as the live path would — and this
 * avoids depending on the SDK's XDR serialization for replay.
 */
function serializeEvent(event: ContractEvent): string {
  return JSON.stringify(event, (_key, value) => (typeof value === "bigint" ? value.toString() : value))
}

/**
 * Record an event that could not be processed, so the next poll retries it
 * instead of permanently dropping the lock state change. The RPC cursor has
 * already advanced past it, so without this row the event is lost forever.
 * Replays of the same event id bump `attempts` rather than duplicating rows.
 */
function recordFailedEvent(event: ContractEvent, err: unknown): void {
  const eventType = typeof event.topics[0] === "string" ? event.topics[0] : null
  db.prepare(
    `INSERT INTO failed_events (id, ledger_seq, event_type, attempts, last_error, last_attempt_at, payload)
     VALUES (?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       attempts = attempts + 1,
       last_error = excluded.last_error,
       last_attempt_at = excluded.last_attempt_at,
       payload = excluded.payload`,
  ).run(
    event.id,
    event.ledger,
    eventType,
    String((err as Error)?.message ?? err),
    Math.floor(Date.now() / 1000),
    serializeEvent(event),
  )
}

/**
 * Re-attempt every recorded failed event whose retry budget hasn't run out.
 * A successful retry deletes the row; a repeated failure bumps `attempts` and
 * updates the error/timestamp. Returns the number of events that recovered.
 */
export function retryFailedEvents(
  options: { process?: (event: ContractEvent) => void; maxAttempts?: number } = {},
): number {
  ensureDb()
  const process = options.process ?? processEvent
  const maxAttempts = options.maxAttempts ?? FAILED_EVENT_MAX_ATTEMPTS

  const rows = db
    .prepare(`SELECT id, payload FROM failed_events WHERE attempts < ? ORDER BY ledger_seq ASC, id ASC`)
    .all(maxAttempts) as { id: string; payload: string }[]

  let recovered = 0
  for (const row of rows) {
    try {
      process(JSON.parse(row.payload) as ContractEvent)
      db.prepare(`DELETE FROM failed_events WHERE id = ?`).run(row.id)
      recovered++
    } catch (err) {
      console.error(`[indexer] retry of failed event ${row.id} failed again:`, err)
      db.prepare(
        `UPDATE failed_events SET attempts = attempts + 1, last_error = ?, last_attempt_at = ? WHERE id = ?`,
      ).run(String((err as Error)?.message ?? err), Math.floor(Date.now() / 1000), row.id)
    }
  }
  return recovered
}

/** Number of events currently recorded as failed (for the health endpoint). */
export function getFailedEventsCount(): number {
  ensureDb()
  return (db.prepare(`SELECT COUNT(*) AS n FROM failed_events`).get() as { n: number }).n
}

/** Recent recorded failures (for debugging the count surfaced in health). */
export function getFailedEvents(limit = 100): FailedEventRecord[] {
  ensureDb()
  return db
    .prepare(
      `SELECT id, ledger_seq AS ledgerSeq, event_type AS eventType, attempts, last_error AS lastError, last_attempt_at AS lastAttemptAt
       FROM failed_events ORDER BY last_attempt_at DESC, id ASC LIMIT ?`,
    )
    .all(limit) as FailedEventRecord[]
}

/** Minimal surface of the Soroban RPC Server the poller needs (injectable in tests). */
interface EventSource {
  getLatestLedger(): Promise<{ sequence: number }>
  getEvents(request: {
    startLedger?: number
    cursor?: string
    filters: { type: "contract"; contractIds: string[] }[]
    limit?: number
  }): Promise<{
    latestLedger: number
    cursor?: string
    events: {
      id: string
      /** Contract address that emitted this event. */
      contractId?: string
      ledger: number
      ledgerClosedAt?: string
      txHash?: string
      topic: xdr.ScVal[]
      value: xdr.ScVal
    }[]
  }>
}

/**
 * Rejects with a timeout error if `promise` doesn't settle within `ms`.
 * Used to bound Soroban RPC calls that can hang (connection accepted, no
 * response) rather than erroring, which would otherwise wedge the poller's
 * `inFlight` guard forever.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[indexer] ${label} timed out after ${ms}ms`))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Fetch and index the next page of contract events, persisting the RPC
 * cursor / last ledger in index_meta so progress survives restarts.
 * Returns the number of events processed.
 */
export async function pollOnce(
  server: EventSource,
  options: { process?: (event: ContractEvent) => void } = {},
): Promise<number> {
  ensureDb()
  const process = options.process ?? processEvent

  // Replay events that failed on a previous poll before fetching new ones,
  // so a transient DB error or decoding bug never silently drops a lock
  // creation/withdrawal (#1122). The RPC cursor has already moved past them,
  // so without this they would be lost forever.
  retryFailedEvents({ process })

  const contractIds = [TOKEN_LOCKER_ID, LP_LOCKER_ID].filter(Boolean)
  if (contractIds.length === 0) {
    throw new Error(
      "[indexer] fatal: both TOKEN_LOCKER_CONTRACT and LP_LOCKER_CONTRACT are unset — refusing to poll with no contract filter (this would silently index every contract's events)",
    )
  }
  const filters = [{ type: "contract" as const, contractIds }]

  const cursor = getMeta(META_CURSOR)
  let request: Parameters<EventSource["getEvents"]>[0]
  if (cursor) {
    request = { cursor, filters, limit: EVENTS_PAGE_LIMIT }
  } else {
    const lastLedger = Number(getMeta(META_LAST_LEDGER) ?? 0)
    const startLedger =
      lastLedger > 0
        ? lastLedger + 1
        : INDEXER_START_LEDGER > 0
          ? INDEXER_START_LEDGER
          : (await withTimeout(server.getLatestLedger(), RPC_CALL_TIMEOUT_MS, "getLatestLedger")).sequence
    request = { startLedger, filters, limit: EVENTS_PAGE_LIMIT }
  }

  let resp: Awaited<ReturnType<EventSource["getEvents"]>>
  try {
    resp = await withTimeout(server.getEvents(request), RPC_CALL_TIMEOUT_MS, "getEvents")
  } catch (err) {
    // A stored cursor can age out of the RPC node's retention window (e.g.
    // after the indexer has been down for a while, or the node's retention
    // is shorter than expected). Recognize that specific failure and clear
    // the cursor so the *next* poll falls back to ledger-based resumption —
    // the same path used when no cursor exists yet — instead of retrying
    // the same dead cursor forever.
    if (cursor && /cursor/i.test(String((err as Error)?.message ?? err))) {
      log.warn("cursor rejected by RPC; clearing cursor and resuming from last indexed ledger", { error: err })
      deleteMeta(META_CURSOR)
      return 0
    }
    throw err
  }

  let processed = 0
  for (const raw of resp.events) {
    const event: ContractEvent = {
      id: raw.id,
      ledger: raw.ledger,
      timestamp: raw.ledgerClosedAt ? Math.floor(Date.parse(raw.ledgerClosedAt) / 1000) : undefined,
      topics: raw.topic.map((t): unknown => scValToNative(t)),
      data: raw.value ? scValToNative(raw.value) : undefined,
    }
    try {
      process(event)
      const newLockId = processEvent({
        id: raw.id,
        contractId: raw.contractId,
        contractId: raw.contractId ?? "",
        ledger: raw.ledger,
        timestamp: raw.ledgerClosedAt ? Math.floor(Date.parse(raw.ledgerClosedAt) / 1000) : undefined,
        ledgerClosedAt: raw.ledgerClosedAt,
        txHash: raw.txHash,
        topics: raw.topic.map((t): unknown => scValToNative(t)),
        data: raw.value ? scValToNative(raw.value) : undefined,
      })
      processed++
      // Issue #1130: kick off an async get_lock simulation to back-fill
      // vesting schedule and metadata for newly created token locks.
      // The result is best-effort — a failure here never aborts indexing.
      if (newLockId) {
        void backfillLockMeta(newLockId, server as unknown as SimulationServer).catch((err) => {
          console.warn(`[indexer] backfillLockMeta failed for ${newLockId}:`, err)
        })
      }
    } catch (err) {
      log.error("failed to process event", { eventId: raw.id, error: err })
      console.error(`[indexer] failed to process event ${raw.id}:`, err)
      // Record it so the next poll retries it instead of permanently losing
      // the lock state change — the cursor has already moved past it (#1122).
      recordFailedEvent(event, err)
    }
  }

  if (resp.cursor) setMeta(META_CURSOR, resp.cursor)
  setMeta(META_LATEST_LEDGER, String(resp.latestLedger))
  const maxEventLedger = resp.events.reduce((max, e) => Math.max(max, e.ledger), 0)
  const pageFull = resp.events.length >= EVENTS_PAGE_LIMIT
  // If the page was full there may be more events in the same ledger that the
  // cursor would have reached. Record one ledger *before* maxEventLedger so
  // that if the cursor later expires the fallback (startLedger = lastIndexed + 1)
  // re-includes maxEventLedger rather than skipping its tail. Already-seen
  // event IDs are deduplicated by INSERT OR IGNORE, so the re-fetch is safe.
  // When the page is partial we've consumed everything up to latestLedger.
  const lastIndexed = pageFull ? Math.max(maxEventLedger - 1, 0) : Math.max(maxEventLedger, resp.latestLedger)
  if (lastIndexed > getLastIndexed()) setMeta(META_LAST_LEDGER, String(lastIndexed))

  return processed
}

interface PollerHandle {
  stop(): void
}

/** Start polling every POLL_INTERVAL_MS (default 10 seconds). */
export function startPolling(options: { server?: EventSource; intervalMs?: number } = {}): PollerHandle {
  ensureDb()
  const server = options.server ?? new Server(RPC_URL, { allowHttp: RPC_URL.startsWith("http://") })
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS

  let inFlight = false
  const tick = async () => {
    if (inFlight) return
    inFlight = true
    try {
      // Drain all consecutive full pages before waiting for the next interval.
      // A fresh indexer catching up after downtime can have many pages of 100
      // events queued; waiting a full poll interval between pages would make
      // catch-up take 10 s × (number of pages) instead of being near-instant.
      let count: number
      do {
        count = await pollOnce(server)
      } while (count >= EVENTS_PAGE_LIMIT)
    } catch (err) {
      log.error("poll failed", { error: err })
    } finally {
      inFlight = false
    }
  }

  void tick()
  const timer = setInterval(() => {
    void tick()
  }, intervalMs)
  return { stop: () => clearInterval(timer) }
}

const isMain =
  typeof process !== "undefined" && process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  log.info("polling started", { rpcUrl: RPC_URL, intervalMs: POLL_INTERVAL_MS })
  startPolling()
  console.log(`[indexer] polling ${RPC_URL} every ${POLL_INTERVAL_MS}ms`)
  const poller = startPolling()

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[indexer] received ${signal}, shutting down gracefully…`)
    poller.stop()
    // Give any in-flight poll tick up to 30 s to finish before we close the DB.
    // The tick sets `inFlight = false` when it completes, but we have no direct
    // handle to that flag here — a small delay is the simplest safe approach.
    await new Promise<void>((resolve) => setTimeout(resolve, 500))
    db.close()
    console.log(`[indexer] clean shutdown complete`)
    process.exit(0)
  }

  process.on('SIGTERM', () => { void shutdown('SIGTERM') })
  process.on('SIGINT',  () => { void shutdown('SIGINT') })
}
