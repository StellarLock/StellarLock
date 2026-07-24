export type TransactionAction = "create_token_lock" | "create_lp_lock" | "withdraw" | "extend"

export type TransactionStatus = "pending" | "success" | "failed"

export interface TransactionRecord {
  /** Soroban/Horizon transaction hash — also the record's unique key. */
  hash: string
  action: TransactionAction
  kind: "token" | "lp"
  /** Wallet address that submitted the transaction. */
  address: string
  /** On-chain lock id, when known at submit time. */
  lockId?: string
  /** Token or pool-share contract address involved. */
  token?: string
  tokenSymbol?: string
  amount?: number
  status: TransactionStatus
  createdAt: number
  updatedAt: number
}
