import { useEffect, useState } from "react"
import { getTransactions, resumePendingPolls, subscribe } from "@/lib/transaction-history"
import type { TransactionRecord } from "@/types/transaction"

/** Live-updating list of recorded transactions for a wallet address. */
export function useTransactionHistory(address: string | null): TransactionRecord[] {
  const [records, setRecords] = useState<TransactionRecord[]>(() => (address ? getTransactions(address) : []))

  useEffect(() => {
    if (!address) {
      setRecords([])
      return
    }
    setRecords(getTransactions(address))
    resumePendingPolls(address)
    return subscribe(() => setRecords(getTransactions(address)))
  }, [address])

  return records
}
