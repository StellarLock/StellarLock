import { describe, it, expect, vi, beforeEach } from "vitest"
import { VALID_PUBLIC_KEY, VALID_CONTRACT_ADDRESS } from "./mocks"
import type { Dex } from "@/types/lock"

const mocks = vi.hoisted(() => ({
  simulateCall: vi.fn(),
  submitCall: vi.fn(),
  submitCallWithHash: vi.fn(),
  getOnChainTokenMeta: vi.fn(),
}))

vi.mock("@/lib/stellar", () => ({
  CONTRACTS: { tokenLocker: "TOKEN_LOCKER", lpLocker: "LP_LOCKER" },
  simulateCall: mocks.simulateCall,
  submitCall: mocks.submitCall,
  submitCallWithHash: mocks.submitCallWithHash,
  STELLAR_DECIMALS: 1e7,
}))

vi.mock("@/lib/token-metadata", () => ({
  getOnChainTokenMeta: mocks.getOnChainTokenMeta,
}))

import {
  getLpLock,
  getLpLocksByCreator,
  getLpLockCountByCreator,
  createLpLock,
  withdrawLpLock,
  extendLpLock,
  transferLpBeneficiary,
  submitTokenApproval,
} from "@/lib/lp-locker"

/** A raw on-chain LP lock record (what simulateCall "get_lock" would return). */
function rawLpLock(overrides: Record<string, unknown> = {}) {
  const nowSec = Math.floor(Date.now() / 1000)
  return {
    id: "7",
    pool_share: VALID_CONTRACT_ADDRESS,
    dex: { tag: "Aquarius" },
    token_a: VALID_CONTRACT_ADDRESS,
    token_b: VALID_CONTRACT_ADDRESS,
    creator: VALID_PUBLIC_KEY,
    beneficiary: VALID_PUBLIC_KEY,
    amount: "10000000", // 1 unit at 7 decimals
    withdrawn: false,
    unlock_at: nowSec + 3600, // 1h in the future
    created_at: nowSec - 3600,
    extended_count: 0,
    metadata: { description: "LP escrow" },
    ...overrides,
  }
}

describe("getLpLock", () => {
  beforeEach(() => {
    mocks.simulateCall.mockReset()
    mocks.getOnChainTokenMeta.mockReset()
    mocks.submitCall.mockReset()
    mocks.submitCallWithHash.mockReset()
  })

  it("returns null when no lock exists on-chain", async () => {
    mocks.simulateCall.mockResolvedValue(null)
    const lock = await getLpLock("999")
    expect(lock).toBeNull()
  })

  it("maps a raw LP lock into a frontend Lock", async () => {
    mocks.simulateCall.mockResolvedValue(rawLpLock())
    const lock = await getLpLock("7")

    expect(lock).not.toBeNull()
    expect(lock?.id).toBe("7")
    expect(lock?.kind).toBe("lp")
    expect(lock?.status).toBe("locked")
    expect(lock?.dex).toBe("aquarius")
    expect(lock?.amount).toBe(1)
    expect(lock?.token.symbol).toContain("LP")
    expect(lock?.creator).toBe(VALID_PUBLIC_KEY)
    expect(lock?.beneficiary).toBe(VALID_PUBLIC_KEY)
  })

  it("marks an LP lock unlockable once its unlock date has passed", async () => {
    mocks.simulateCall.mockResolvedValue(rawLpLock({ withdrawn: false }))
    // Shift unlock_at into the past.
    mocks.simulateCall.mockImplementation(() => rawLpLock({ unlock_at: Math.floor(Date.now() / 1000) - 60 }))
    const lock = await getLpLock("7")
    expect(lock?.status).toBe("unlockable")
  })

  it("marks a withdrawn LP lock as withdrawn regardless of unlock date", async () => {
    mocks.simulateCall.mockImplementation(() =>
      rawLpLock({ withdrawn: true, unlock_at: Math.floor(Date.now() / 1000) - 60 }),
    )
    const lock = await getLpLock("7")
    expect(lock?.status).toBe("withdrawn")
  })

  it("falls back to tokenA/tokenB prefixes for the symbol when no token metadata exists", async () => {
    mocks.simulateCall.mockResolvedValue(rawLpLock())
    const lock = await getLpLock("7")
    expect(lock?.token.symbol).toBe(`${VALID_CONTRACT_ADDRESS.slice(0, 4)}-${VALID_CONTRACT_ADDRESS.slice(0, 4)} LP`)
    expect(lock?.token.decimals).toBe(7)
  })
})

describe("createLpLock", () => {
  const sign = vi.fn().mockResolvedValue({ signedTxXdr: "signed" })
  const args = {
    poolShareAddress: VALID_CONTRACT_ADDRESS,
    dex: "aquarius" as Dex,
    tokenA: VALID_CONTRACT_ADDRESS,
    tokenB: VALID_CONTRACT_ADDRESS,
    amount: 2.5,
    beneficiary: VALID_PUBLIC_KEY,
    unlockAt: Math.floor(Date.now() / 1000) + 3600,
    metadata: { description: "Pool escrow" },
  }

  beforeEach(() => {
    mocks.submitCallWithHash.mockReset()
    mocks.submitCall.mockReset()
  })

  it("submits a create_lock call and returns the new lock id + tx hash", async () => {
    mocks.submitCallWithHash.mockResolvedValue({ result: 42n, txHash: "deadbeef" })

    const out = await createLpLock(args, VALID_PUBLIC_KEY, sign)

    expect(out).toEqual({ id: "42", txHash: "deadbeef" })
    expect(mocks.submitCallWithHash).toHaveBeenCalledWith(
      "LP_LOCKER",
      "create_lock",
      expect.any(Array),
      VALID_PUBLIC_KEY,
      sign,
      undefined,
    )
  })

  it("propagates the onProgress callback", async () => {
    mocks.submitCallWithHash.mockResolvedValue({ result: 42n, txHash: "x" })
    const onProgress = vi.fn()
    await createLpLock(args, VALID_PUBLIC_KEY, sign, onProgress)
    expect(mocks.submitCallWithHash).toHaveBeenCalledWith(
      "LP_LOCKER",
      "create_lock",
      expect.any(Array),
      VALID_PUBLIC_KEY,
      sign,
      onProgress,
    )
  })
})

describe("withdrawLpLock / extendLpLock / transferLpBeneficiary", () => {
  const sign = vi.fn().mockResolvedValue({ signedTxXdr: "signed" })

  beforeEach(() => {
    mocks.submitCallWithHash.mockReset()
  })

  it.each([
    ["withdrawLpLock", "withdraw", (addr: string) => withdrawLpLock("7", addr, sign)],
    ["extendLpLock", "extend", (addr: string) => extendLpLock("7", Date.now() / 1000 + 7200, addr, sign)],
    [
      "transferLpBeneficiary",
      "transfer_beneficiary",
      (addr: string) => transferLpBeneficiary("7", VALID_PUBLIC_KEY, addr, sign),
    ],
  ] as const)("%s calls submitCallWithHash with method %s", async (_name, method, call) => {
    mocks.submitCallWithHash.mockResolvedValue({ result: undefined, txHash: "tx" })
    const out = await call(VALID_PUBLIC_KEY)
    expect(out.txHash).toBe("tx")
    const callArgs = mocks.submitCallWithHash.mock.calls[0] as [string, string, unknown, string, unknown]
    expect(callArgs[0]).toBe("LP_LOCKER")
    expect(callArgs[1]).toBe(method)
  })
})

describe("submitTokenApproval", () => {
  beforeEach(() => {
    mocks.submitCall.mockReset()
  })

  it("calls approve on the token address with stroop amount and zero expiration ledger", async () => {
    mocks.submitCall.mockResolvedValue(undefined)
    const sign = vi.fn().mockResolvedValue({ signedTxXdr: "signed" })

    await submitTokenApproval(
      VALID_CONTRACT_ADDRESS,
      VALID_PUBLIC_KEY,
      VALID_CONTRACT_ADDRESS, // spender = the lp-locker contract id
      1,
      VALID_PUBLIC_KEY,
      sign,
    )

    expect(mocks.submitCall).toHaveBeenCalledTimes(1)
    const callArgs = mocks.submitCall.mock.calls[0] as [string, string, unknown[], string, typeof sign]
    expect(callArgs[0]).toBe(VALID_CONTRACT_ADDRESS)
    expect(callArgs[1]).toBe("approve")
    expect(callArgs[3]).toBe(VALID_PUBLIC_KEY)
    expect(callArgs[4]).toBe(sign)
    expect(callArgs[2]).toHaveLength(4)
  })
})

describe("getLpLocksByCreator / counts", () => {
  beforeEach(() => {
    mocks.simulateCall.mockReset()
    mocks.getOnChainTokenMeta.mockReset()
  })

  it("returns an empty list when there are no locks", async () => {
    mocks.simulateCall.mockResolvedValue(null)
    mocks.getOnChainTokenMeta.mockResolvedValue({ symbol: "X", name: "X", decimals: 7 })
    const locks = await getLpLocksByCreator(VALID_PUBLIC_KEY)
    expect(locks).toEqual([])
  })

  it("enriches each lock with on-chain pool token metadata", async () => {
    const one = rawLpLock({ id: "1" })
    const two = rawLpLock({ id: "2" })
    mocks.simulateCall.mockResolvedValue([one, two])
    mocks.getOnChainTokenMeta.mockImplementation((addr: string) => ({
      symbol: addr === VALID_CONTRACT_ADDRESS ? "POOL" : "X",
      name: "Pool Token",
      decimals: 6,
    }))

    const locks = await getLpLocksByCreator(VALID_PUBLIC_KEY)
    expect(locks).toHaveLength(2)
    expect(locks[0].token.decimals).toBe(6)
  })

  it("returns a numeric count from the creator index", async () => {
    mocks.simulateCall.mockResolvedValue(5)
    mocks.getOnChainTokenMeta.mockResolvedValue({ symbol: "X", name: "X", decimals: 7 })
    const count = await getLpLockCountByCreator(VALID_PUBLIC_KEY)
    expect(count).toBe(5)
  })
})
