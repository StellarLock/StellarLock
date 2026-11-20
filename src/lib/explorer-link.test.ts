import { describe, it, expect } from "vitest"
import { Keypair, StrKey } from "@stellar/stellar-sdk"
import { explorerLink } from "./stellar"

const ACCOUNT = Keypair.random().publicKey()
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 7))

describe("explorerLink (#1107)", () => {
  it("uses /account/ for G… addresses", () => {
    expect(explorerLink(ACCOUNT)).toMatch(new RegExp(`^https://stellar\\.expert/explorer/[a-z]+/account/${ACCOUNT}$`))
  })

  it("uses /contract/ for C… addresses", () => {
    expect(explorerLink(CONTRACT)).toMatch(
      new RegExp(`^https://stellar\\.expert/explorer/[a-z]+/contract/${CONTRACT}$`),
    )
  })
})
