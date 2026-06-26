import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { saveDraft, loadDraft, clearDraft, getDraftKey } from "@/hooks/useDraftStorage"

describe("Draft Storage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it("should get correct draft keys for token and lp types", () => {
    expect(getDraftKey("token")).toBe("stellarlock:draft:token-lock")
    expect(getDraftKey("lp")).toBe("stellarlock:draft:lp-lock")
  })

  it("should save and load token draft", () => {
    const data = {
      tokenAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      amount: "1000",
      unlockDate: "2025-12-31",
    }
    saveDraft("token", data)
    const loaded = loadDraft("token")
    expect(loaded).toEqual(data)
  })

  it("should save and load lp draft", () => {
    const data = {
      dex: "aquarius",
      tokenA: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      tokenB: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4",
      amount: "500",
    }
    saveDraft("lp", data)
    const loaded = loadDraft("lp")
    expect(loaded).toEqual(data)
  })

  it("should return null for missing draft", () => {
    const loaded = loadDraft("token")
    expect(loaded).toBeNull()
  })

  it("should clear token draft", () => {
    const data = { tokenAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4" }
    saveDraft("token", data)
    clearDraft("token")
    expect(loadDraft("token")).toBeNull()
  })

  it("should keep lp draft separate from token draft", () => {
    const tokenData = { tokenAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4" }
    const lpData = { dex: "aquarius" }
    saveDraft("token", tokenData)
    saveDraft("lp", lpData)
    expect(loadDraft("token")).toEqual(tokenData)
    expect(loadDraft("lp")).toEqual(lpData)
  })

  it("should overwrite existing draft", () => {
    const data1 = { amount: "100" }
    const data2 = { amount: "200" }
    saveDraft("token", data1)
    expect(loadDraft("token")).toEqual(data1)
    saveDraft("token", data2)
    expect(loadDraft("token")).toEqual(data2)
  })
})
