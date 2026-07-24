import type { TransactionRecord, TxType, TxStatus } from "@/types/transaction"
import { NETWORK } from "@/lib/stellar"

const STORAGE_KEY = "stellarlock:tx_history"
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

// ── Persistence ───────────────────────────────────────────────────────────────

function load(): TransactionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as TransactionRecord[]) : []
  } catch {
    return []
  }
}

function save(records: TransactionRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // localStorage may be unavailable (private browsing quota exceeded etc.)
  }
}

function pruneOld(records: TransactionRecord[]): TransactionRecord[] {
  const cutoff = Date.now() - MAX_AGE_MS
  return records.filter((r) => r.timestamp > cutoff)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function addTransaction(hash: string, type: TxType, extra?: Pick<TransactionRecord, "lockId" | "amount">): void {
  const records = pruneOld(load())
  const record: TransactionRecord = {
    hash,
    type,
    status: "pending",
    timestamp: Date.now(),
    network: NETWORK.id as "testnet" | "mainnet",
    ...extra,
  }
  save([record, ...records])
}

export function getTransactions(): TransactionRecord[] {
  return pruneOld(load())
}

export function clearTransactions(): void {
  save([])
}

// ── Status polling ────────────────────────────────────────────────────────────

interface HorizonTxResponse {
  successful: boolean
}

async function fetchTxStatus(hash: string): Promise<TxStatus> {
  const url = `${NETWORK.horizonUrl}/transactions/${hash}`
  const res = await fetch(url)
  if (res.status === 404) return "pending"
  if (!res.ok) return "pending"
  const data = (await res.json()) as HorizonTxResponse
  return data.successful ? "success" : "failed"
}

export async function refreshPendingStatuses(): Promise<TransactionRecord[]> {
  const records = pruneOld(load())
  const pending = records.filter((r) => r.status === "pending")

  if (pending.length === 0) return records

  const settled = await Promise.allSettled(
    pending.map(async (r) => {
      const status = await fetchTxStatus(r.hash)
      return { hash: r.hash, status }
    }),
  )

  const updates = new Map<string, TxStatus>()
  for (const result of settled) {
    if (result.status === "fulfilled") {
      updates.set(result.value.hash, result.value.status)
    }
  }

  const updated = records.map((r) => {
    const newStatus = updates.get(r.hash)
    return newStatus && newStatus !== "pending" ? { ...r, status: newStatus } : r
  })

  save(updated)
  return updated
}

export function stellarExpertLink(hash: string, network: string): string {
  const net = network === "mainnet" ? "public" : "testnet"
  return `https://stellar.expert/explorer/${net}/tx/${hash}`
}
