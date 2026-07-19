import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk'

// The db module reads LOCK_INDEX_DB_PATH at import time, so the indexer is
// imported dynamically after pointing it at a throwaway database file.
type Indexer = typeof import('./index')

const tmpDir = mkdtempSync(join(tmpdir(), 'lock-indexer-test-'))
let indexer: Indexer

const creator = Keypair.random().publicKey()
const beneficiary = Keypair.random().publicKey()
const newBeneficiary = Keypair.random().publicKey()
const tokenAddr = Keypair.random().publicKey()
const poolShareAddr = Keypair.random().publicKey()

const now = Math.floor(Date.now() / 1000)
const unlockAt = now + 86_400
const lpUnlockAt = now + 172_800
const extendedUnlockAt = now + 259_200

const sym = (s: string) => xdr.ScVal.scvSymbol(s)
const u64 = (n: number | bigint) => nativeToScVal(n, { type: 'u64' })
const i128 = (n: bigint) => nativeToScVal(n, { type: 'i128' })
const addr = (a: string) => nativeToScVal(a, { type: 'address' })

interface FakeEvent {
  id: string
  ledger: number
  ledgerClosedAt?: string
  topic: xdr.ScVal[]
  value: xdr.ScVal
}

interface FakeBatch {
  latestLedger: number
  cursor?: string
  events: FakeEvent[]
}

class FakeRpcServer {
  requests: unknown[] = []
  private batches: FakeBatch[]
  constructor(batches: FakeBatch[], private latest = 100) {
    this.batches = [...batches]
  }
  async getLatestLedger() {
    return { sequence: this.latest }
  }
  async getEvents(request: unknown): Promise<FakeBatch> {
    this.requests.push(request)
    return this.batches.shift() ?? { latestLedger: this.latest, events: [] }
  }
}

function makeEvent(id: string, ledger: number, topic: xdr.ScVal[], value?: xdr.ScVal): FakeEvent {
  return {
    id,
    ledger,
    ledgerClosedAt: new Date(now * 1000).toISOString(),
    topic,
    value: value ?? xdr.ScVal.scvVoid(),
  }
}

// Events mirror the contracts' schemas: token-locker publishes its payload in
// the topics with unit data; lp-locker withdraw/extend publish (symbol,) topics
// with a tuple payload in the data.
const lockCreated = makeEvent('evt-1', 101, [
  sym('lock_created'), u64(1n), addr(creator), addr(tokenAddr), i128(500n), addr(beneficiary), u64(BigInt(unlockAt)),
])
const lpLockCreated = makeEvent('evt-2', 102, [
  sym('lp_lock_created'), u64(1n), addr(creator), addr(poolShareAddr), i128(250n), addr(beneficiary), u64(BigInt(lpUnlockAt)),
])
const lockWithdrawn = makeEvent('evt-3', 110, [
  sym('lock_withdrawn'), u64(1n), addr(beneficiary), addr(tokenAddr), i128(500n),
])
const lpLockExtended = makeEvent(
  'evt-4', 111,
  [sym('lp_lock_extended')],
  nativeToScVal([u64(1n), addr(creator), u64(BigInt(lpUnlockAt)), u64(BigInt(extendedUnlockAt))]),
)
const lpBeneficiaryTransferred = makeEvent(
  'evt-5', 112,
  [sym('lp_beneficiary_transferred')],
  nativeToScVal([u64(1n), addr(beneficiary), addr(newBeneficiary)]),
)

beforeAll(async () => {
  process.env.LOCK_INDEX_DB_PATH = join(tmpDir, 'index.sqlite')
  indexer = await import('./index')
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('lock indexer', () => {
  it('indexes lock creation events from a polled event stream', async () => {
    const server = new FakeRpcServer([
      { latestLedger: 102, cursor: 'cursor-1', events: [lockCreated, lpLockCreated] },
    ])

    const processed = await indexer.pollOnce(server)
    expect(processed).toBe(2)

    // First poll has no persisted state, so it starts from the latest ledger.
    expect(server.requests[0]).toMatchObject({ startLedger: 100 })

    const stats = indexer.getStats()
    expect(stats.totalLocks).toBe(2)
    expect(stats.totalValue).toBe(750n)
    expect(stats.uniqueTokens).toBe(2)
    expect(stats.upcomingUnlocks).toHaveLength(2)
    expect(stats.upcomingUnlocks[0].unlockAt).toBe(unlockAt)

    const tokenLocks = indexer.getLocksForToken(tokenAddr)
    expect(tokenLocks).toHaveLength(1)
    expect(tokenLocks[0]).toMatchObject({
      id: 'token:1',
      kind: 'token',
      creator,
      beneficiary,
      amount: 500n,
      unlockAt,
      status: 'locked',
    })

    expect(indexer.getLastIndexed()).toBe(102)
  })

  it('resumes from the persisted cursor and applies state-mutating events', async () => {
    const server = new FakeRpcServer([
      { latestLedger: 112, cursor: 'cursor-2', events: [lockWithdrawn, lpLockExtended, lpBeneficiaryTransferred] },
    ])

    const processed = await indexer.pollOnce(server)
    expect(processed).toBe(3)
    expect(server.requests[0]).toMatchObject({ cursor: 'cursor-1' })

    const stats = indexer.getStats()
    expect(stats.totalLocks).toBe(2)

    const [tokenLock] = indexer.getLocksForToken(tokenAddr)
    expect(tokenLock.status).toBe('withdrawn')
    expect(tokenLock.withdrawn).toBe(true)

    const [lpLock] = indexer.getLocksForToken(poolShareAddr)
    expect(lpLock).toMatchObject({
      id: 'lp:1',
      kind: 'lp',
      status: 'locked',
      unlockAt: extendedUnlockAt,
      beneficiary: newBeneficiary,
      extendedCount: 1,
    })

    // Only the still-locked LP lock has an upcoming unlock now.
    expect(stats.upcomingUnlocks).toHaveLength(1)
    expect(stats.upcomingUnlocks[0].id).toBe('lp:1')
    expect(indexer.getLastIndexed()).toBe(112)
  })

  it('ignores replayed events it has already processed', async () => {
    const server = new FakeRpcServer([
      { latestLedger: 112, events: [lockCreated, lockWithdrawn] },
    ])

    await indexer.pollOnce(server)

    const stats = indexer.getStats()
    expect(stats.totalLocks).toBe(2)
    expect(stats.totalValue).toBe(750n)
    // The replayed lock_created did not resurrect the withdrawn lock.
    expect(indexer.getLocksForToken(tokenAddr)[0].status).toBe('withdrawn')
  })

  it('survives a restart: fresh module instances resume from the same database', async () => {
    vi.resetModules()
    const restarted: Indexer = await import('./index')

    const server = new FakeRpcServer([{ latestLedger: 120, events: [] }])
    await restarted.pollOnce(server)

    // The cursor persisted in SQLite drives the resumed request.
    expect(server.requests[0]).toMatchObject({ cursor: 'cursor-2' })
    expect(restarted.getStats().totalLocks).toBe(2)
    expect(restarted.getLastIndexed()).toBe(120)
  })

  it('runs the polling loop on an interval via startPolling', async () => {
    vi.resetModules()
    const fresh: Indexer = await import('./index')

    const server = new FakeRpcServer([
      { latestLedger: 120, events: [] },
      { latestLedger: 121, events: [] },
    ])

    const poller = fresh.startPolling({ server, intervalMs: 10 })
    try {
      await vi.waitFor(() => expect(server.requests.length).toBeGreaterThanOrEqual(2))
    } finally {
      poller.stop()
    }
  })
})
