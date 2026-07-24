import { describe, it, expect, beforeEach, vi } from "vitest"
import { addTransaction, getTransactions } from "@/lib/transaction-history"

describe("transaction-history", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ successful: true }),
      }),
    )
  })

  it("records a transaction as pending and persists it to localStorage", () => {
    const record = addTransaction({
      hash: "abc123",
      action: "create_token_lock",
      kind: "token",
      address: "GALICE",
      lockId: "1",
      token: "CTOKEN",
      amount: 100,
    })

    expect(record.status).toBe("pending")
    expect(getTransactions("GALICE")).toHaveLength(1)
    expect(getTransactions("GALICE")[0].hash).toBe("abc123")
  })

  it("only returns transactions for the requested address", () => {
    addTransaction({ hash: "h1", action: "withdraw", kind: "token", address: "GALICE" })
    addTransaction({ hash: "h2", action: "withdraw", kind: "token", address: "GBOB" })

    expect(getTransactions("GALICE").map((r) => r.hash)).toEqual(["h1"])
    expect(getTransactions("GBOB").map((r) => r.hash)).toEqual(["h2"])
  })

  it("orders transactions newest first", () => {
    const now = Date.now()
    vi.spyOn(Date, "now").mockReturnValueOnce(now).mockReturnValueOnce(now + 1000)

    addTransaction({ hash: "older", action: "withdraw", kind: "token", address: "GALICE" })
    addTransaction({ hash: "newer", action: "withdraw", kind: "token", address: "GALICE" })

    expect(getTransactions("GALICE").map((r) => r.hash)).toEqual(["newer", "older"])
  })

  it("updates status to success once Horizon confirms the transaction", async () => {
    addTransaction({ hash: "abc123", action: "withdraw", kind: "token", address: "GALICE" })

    await vi.waitFor(() => {
      expect(getTransactions("GALICE")[0].status).toBe("success")
    })
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

    addTransaction({ hash: "abc123", action: "withdraw", kind: "token", address: "GALICE" })

    await vi.waitFor(() => {
      expect(getTransactions("GALICE")[0].status).toBe("failed")
    })
  })
})
