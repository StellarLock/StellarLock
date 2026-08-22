import { describe, it, expect, vi, beforeEach } from "vitest"
import { createSplitLock } from "@/lib/split-lock"
import type { CreateSplitLockArgs, SplitBeneficiary } from "@/lib/split-lock"
import { xdr } from "@stellar/stellar-sdk"

// We mock submitCallWithHash from stellar.ts since it actually submits transactions
vi.mock("@/lib/stellar", () => ({
  CONTRACTS: {
    tokenLocker: "CBMOCKTOKENLOCKERCONTRACTADDRESS1234567890123456789",
  },
  STELLAR_DECIMALS: 10_000_000,
  submitCallWithHash: vi.fn().mockResolvedValue({ result: undefined, txHash: "mock-tx-hash" }),
}))

import { submitCallWithHash } from "@/lib/stellar"

const VALID_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
const VALID_TOKEN = "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW"

function buildBaseArgs(overrides: Partial<CreateSplitLockArgs> = {}): CreateSplitLockArgs {
  return {
    tokenAddress: VALID_TOKEN,
    totalAmount: 1000,
    beneficiaries: [
      { address: VALID_ADDRESS, shareBps: 5000 },
      { address: VALID_ADDRESS, shareBps: 5000 },
    ],
    unlockAt: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days from now
    ...overrides,
  }
}

describe("createSplitLock", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should call submitCall with the correct contract and function name", async () => {
    const args = buildBaseArgs()

    await createSplitLock(args, VALID_ADDRESS, vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." }))

    expect(submitCallWithHash).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(submitCallWithHash).mock.calls[0]
    expect(callArgs[0]).toBe("CBMOCKTOKENLOCKERCONTRACTADDRESS1234567890123456789")
    expect(callArgs[1]).toBe("create_split_lock")
  })

  it("should include source address, token address, amount, beneficiaries, and unlock in scArgs", async () => {
    const args = buildBaseArgs()
    const signTx = vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." })

    await createSplitLock(args, VALID_ADDRESS, signTx)

    const callArgs = vi.mocked(submitCallWithHash).mock.calls[0]
    const scArgs = callArgs[2]

    expect(scArgs).toHaveLength(6)
    // scArgs[0] = source address, scArgs[1] = token address, scArgs[2] = amount
    // scArgs[3] = beneficiaries vec, scArgs[4] = unlock at, scArgs[5] = void (no vesting)
    expect(scArgs[5].switch()).toBe(xdr.ScValType.scvVoid())
  })

  it("should encode beneficiaries as a vec of vecs [address, shareBps]", async () => {
    const args = buildBaseArgs({
      beneficiaries: [
        { address: VALID_ADDRESS, shareBps: 7000 },
        { address: VALID_ADDRESS, shareBps: 3000 },
      ],
    })
    const signTx = vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." })

    await createSplitLock(args, VALID_ADDRESS, signTx)

    const callArgs = vi.mocked(submitCallWithHash).mock.calls[0]
    const scArgs = callArgs[2]
    const beneficiariesVal = scArgs[3]

    // Should be a vec of 2 elements
    expect(beneficiariesVal.switch()).toBe(xdr.ScValType.scvVec())
    const beneficiaries = beneficiariesVal.vec()
    expect(beneficiaries).toHaveLength(2)
  })

  it("should include vesting scvMap when vesting is provided", async () => {
    const vestingStart = Math.floor(Date.now() / 1000)
    const vestingEnd = vestingStart + 86400 * 180
    const args = buildBaseArgs({
      vesting: { start: vestingStart, end: vestingEnd },
    })
    const signTx = vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." })

    await createSplitLock(args, VALID_ADDRESS, signTx)

    const callArgs = vi.mocked(submitCallWithHash).mock.calls[0]
    const scArgs = callArgs[2]

    // 6th arg should be a map (vesting config), not void
    expect(scArgs[5].switch()).toBe(xdr.ScValType.scvMap())
  })

  it("should include scvVoid when no vesting is provided", async () => {
    const args = buildBaseArgs({ vesting: undefined })
    const signTx = vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." })

    await createSplitLock(args, VALID_ADDRESS, signTx)

    const callArgs = vi.mocked(submitCallWithHash).mock.calls[0]
    const scArgs = callArgs[2]

    expect(scArgs[5].switch()).toBe(xdr.ScValType.scvVoid())
  })

  it("should handle a single beneficiary (edge case)", async () => {
    const args = buildBaseArgs({
      beneficiaries: [{ address: VALID_ADDRESS, shareBps: 10000 }],
    })
    const signTx = vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." })

    await createSplitLock(args, VALID_ADDRESS, signTx)

    expect(submitCallWithHash).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(submitCallWithHash).mock.calls[0]
    const scArgs = callArgs[2]
    const beneficiariesVal = scArgs[3]
    expect(beneficiariesVal.vec()).toHaveLength(1)
  })

  it("should handle many beneficiaries (up to 10)", async () => {
    const manyBeneficiaries: SplitBeneficiary[] = Array.from({ length: 10 }, () => ({
      address: VALID_ADDRESS,
      shareBps: 1000, // 10% each = 100%
    }))
    const args = buildBaseArgs({ beneficiaries: manyBeneficiaries })
    const signTx = vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." })

    await createSplitLock(args, VALID_ADDRESS, signTx)

    expect(submitCallWithHash).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(submitCallWithHash).mock.calls[0]
    const scArgs = callArgs[2]
    expect(scArgs[3].vec()).toHaveLength(10)
  })

  it("should convert totalAmount to stroops correctly", async () => {
    // 1 token = 10_000_000 stroops
    const args = buildBaseArgs({ totalAmount: 1 })
    const signTx = vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." })

    await createSplitLock(args, VALID_ADDRESS, signTx)

    const callArgs = vi.mocked(submitCallWithHash).mock.calls[0]
    const scArgs = callArgs[2]
    const amountVal = scArgs[2]

    // Should be i128 with value 10_000_000
    expect(amountVal.switch()).toBe(xdr.ScValType.scvI128())
    const hi = amountVal.i128().hi()
    const lo = amountVal.i128().lo()
    // 10_000_000 fits in lo
    expect(lo.toBigInt()).toBe(10_000_000n)
    expect(hi.toBigInt()).toBe(0n)
  })

  it("should pass the signTransaction function to submitCall", async () => {
    const args = buildBaseArgs()
    const signTx = vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." })

    await createSplitLock(args, VALID_ADDRESS, signTx)

    const callArgs = vi.mocked(submitCallWithHash).mock.calls[0]
    // 4th arg is sourceAddress, 5th is signTransaction
    expect(callArgs[3]).toBe(VALID_ADDRESS)
    expect(callArgs[4]).toBe(signTx)
  })

  it("resolves with the submission's txHash so callers can record it in history", async () => {
    const args = buildBaseArgs()
    const signTx = vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." })

    const result = await createSplitLock(args, VALID_ADDRESS, signTx)

    expect(result).toEqual({ txHash: "mock-tx-hash" })
  })
})
