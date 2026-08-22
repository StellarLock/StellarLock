import { describe, it, expect, vi, beforeEach } from "vitest"

// transferBeneficiary/transferLpBeneficiary used to call submitCall, which
// discards the transaction hash — LockDetail's handleTransfer had nothing to
// pass to addTransaction(). Both now go through submitCallWithHash instead.
vi.mock("@/lib/stellar", () => ({
  CONTRACTS: {
    tokenLocker: "CBMOCKTOKENLOCKERCONTRACTADDRESS1234567890123456789",
    lpLocker: "CBMOCKLPLOCKERCONTRACTADDRESS12345678901234567890123",
  },
  submitCallWithHash: vi.fn().mockResolvedValue({ result: undefined, txHash: "transfer-tx-hash" }),
  submitCall: vi.fn().mockResolvedValue(undefined),
}))

import { submitCallWithHash, submitCall } from "@/lib/stellar"
import { transferBeneficiary } from "@/lib/token-locker"
import { transferLpBeneficiary } from "@/lib/lp-locker"

const VALID_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
const signTx = vi.fn().mockResolvedValue({ signedTxXdr: "AAAA..." })

describe("transferBeneficiary / transferLpBeneficiary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("token-locker's transferBeneficiary submits via submitCallWithHash and returns the real txHash", async () => {
    const result = await transferBeneficiary("1", VALID_ADDRESS, VALID_ADDRESS, signTx)

    expect(submitCallWithHash).toHaveBeenCalledTimes(1)
    expect(submitCallWithHash).toHaveBeenCalledWith(
      "CBMOCKTOKENLOCKERCONTRACTADDRESS1234567890123456789",
      "transfer_beneficiary",
      expect.any(Array),
      VALID_ADDRESS,
      signTx,
      undefined,
    )
    expect(result).toEqual({ txHash: "transfer-tx-hash" })
    expect(submitCall).not.toHaveBeenCalled()
  })

  it("lp-locker's transferLpBeneficiary submits via submitCallWithHash and returns the real txHash", async () => {
    const result = await transferLpBeneficiary("1", VALID_ADDRESS, VALID_ADDRESS, signTx)

    expect(submitCallWithHash).toHaveBeenCalledTimes(1)
    expect(submitCallWithHash).toHaveBeenCalledWith(
      "CBMOCKLPLOCKERCONTRACTADDRESS12345678901234567890123",
      "transfer_beneficiary",
      expect.any(Array),
      VALID_ADDRESS,
      signTx,
      undefined,
    )
    expect(result).toEqual({ txHash: "transfer-tx-hash" })
  })
})
