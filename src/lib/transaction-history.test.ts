import { describe, it, expect, beforeEach, vi } from "vitest"
import { addTransaction, getTransactions, clearTransactions, refreshPendingStatuses } from "@/lib/transaction-history"

describe("transaction-history", () => {
  beforeEach(() => {
    clearTransactions()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ successful: true }),
      }),
    )
  })

  it("records a transaction as pending", () => {
    addTransaction("abc123", "create_lock", { lockId: "1", amount: "100" })

    const records = getTransactions()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ hash: "abc123", type: "create_lock", status: "pending" })
  })

  it("orders transactions newest first", () => {
    addTransaction("older", "withdraw")
    addTransaction("newer", "extend")

    expect(getTransactions().map((r) => r.hash)).toEqual(["newer", "older"])
  })

  it("updates status to success once Horizon confirms the transaction", async () => {
    addTransaction("abc123", "withdraw")

    const updated = await refreshPendingStatuses()
    expect(updated[0].status).toBe("success")
  })

  it("marks the transaction failed when Horizon reports it unsuccessful", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ successful: false }),
      }),
    )

    addTransaction("abc123", "withdraw")

    const updated = await refreshPendingStatuses()
    expect(updated[0].status).toBe("failed")
  })

  it("clearTransactions empties the store", () => {
    addTransaction("abc123", "withdraw")
    clearTransactions()
    expect(getTransactions()).toHaveLength(0)
  })
})
