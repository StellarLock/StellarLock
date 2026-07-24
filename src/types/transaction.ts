export type TxType = "create_lock" | "withdraw" | "extend" | "transfer" | "split_lock"
export type TxStatus = "pending" | "success" | "failed"

export interface TransactionRecord {
  hash: string
  type: TxType
  status: TxStatus
  timestamp: number
  lockId?: string
  amount?: string
  network: "testnet" | "mainnet"
}
