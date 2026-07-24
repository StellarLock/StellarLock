import { NETWORK } from "@/lib/stellar"
import type { TransactionRecord } from "@/types/transaction"

const STORAGE_KEY = "stellarlock:tx-history"
const MAX_RECORDS = 200
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 40 // ~2 minutes

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify(): void {
  listeners.forEach((listener) => listener())
}

function readAll(): TransactionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as TransactionRecord[]) : []
  } catch {
    return []
  }
}

function writeAll(records: TransactionRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)))
  } catch {
    // localStorage unavailable/full — history just won't persist this update
  }
}

/** Record a submitted transaction and start polling Horizon for its final status. */
export function addTransaction(
  record: Omit<TransactionRecord, "status" | "createdAt" | "updatedAt">,
): TransactionRecord {
  const now = Date.now()
  const full: TransactionRecord = { ...record, status: "pending", createdAt: now, updatedAt: now }
  writeAll([full, ...readAll()])
  notify()
  pollStatus(full.hash)
  return full
}

/** All recorded transactions for a wallet address, newest first. */
export function getTransactions(address: string): TransactionRecord[] {
  return readAll()
    .filter((r) => r.address === address)
    .sort((a, b) => b.createdAt - a.createdAt)
}

function updateTransaction(hash: string, patch: Partial<TransactionRecord>): void {
  const all = readAll()
  const idx = all.findIndex((r) => r.hash === hash)
  if (idx === -1) return
  all[idx] = { ...all[idx], ...patch, updatedAt: Date.now() }
  writeAll(all)
  notify()
}

async function pollStatus(hash: string, attempt = 0): Promise<void> {
  if (attempt >= MAX_POLL_ATTEMPTS) return

  try {
    const res = await fetch(`${NETWORK.horizonUrl}/transactions/${hash}`)

    if (res.status === 404) {
      setTimeout(() => pollStatus(hash, attempt + 1), POLL_INTERVAL_MS)
      return
    }
    if (!res.ok) throw new Error(`Horizon error ${res.status}`)

    const data = (await res.json()) as { successful: boolean }
    updateTransaction(hash, { status: data.successful ? "success" : "failed" })
  } catch {
    setTimeout(() => pollStatus(hash, attempt + 1), POLL_INTERVAL_MS)
  }
}

/** Resume polling for any transactions still pending from a previous session. */
export function resumePendingPolls(address: string): void {
  getTransactions(address)
    .filter((r) => r.status === "pending")
    .forEach((r) => pollStatus(r.hash))
}
