/**
 * Unit tests for the wallet error-message mappings — #694
 *
 * getFriendlyError and getConnectHelp each pick their copy by substring
 * ("cancel"/"rejected", "network", "freighter"/"extension") and otherwise
 * fall back to a default. A typo in any check would silently drop users to
 * the generic message, so every branch is pinned here.
 */
import { describe, it, expect } from "vitest"
import { getConnectHelp, getFriendlyError } from "@/lib/wallet-errors"

const REJECTED_ERROR = "Connection was rejected. Please approve the prompt in Freighter."
const NETWORK_ERROR = "The wallet is on the wrong network. Switch Freighter to the app network and try again."
const NOT_DETECTED_ERROR = "Freighter was not detected. Install or unlock the extension and retry."

const REJECTED_HELP = "Approve the connection popup in Freighter to continue."
const NETWORK_HELP = "Switch Freighter to Testnet or Mainnet to match the app and try again."
const NOT_DETECTED_HELP = "Install the Freighter extension or unlock it, then try again."
const DEFAULT_HELP = "Check your browser extension and network connection, then retry."

describe("getFriendlyError", () => {
  it.each(["User cancelled the request", "Connection CANCELLED", "Request rejected by user"])(
    "maps cancel/rejected messages (%s)",
    (msg) => {
      expect(getFriendlyError(msg)).toBe(REJECTED_ERROR)
    },
  )

  it.each(["network error", "Wrong NETWORK selected"])("maps network messages (%s)", (msg) => {
    expect(getFriendlyError(msg)).toBe(NETWORK_ERROR)
  })

  it.each(["Freighter is not installed", "Extension not found"])(
    "maps freighter/extension messages (%s)",
    (msg) => {
      expect(getFriendlyError(msg)).toBe(NOT_DETECTED_ERROR)
    },
  )

  it("passes unrecognised messages through unchanged", () => {
    expect(getFriendlyError("Something odd happened")).toBe("Something odd happened")
    expect(getFriendlyError("")).toBe("")
  })

  it("checks cancel/rejected before network and freighter", () => {
    expect(getFriendlyError("Freighter rejected the network request")).toBe(REJECTED_ERROR)
    expect(getFriendlyError("Freighter network mismatch")).toBe(NETWORK_ERROR)
  })
})

describe("getConnectHelp", () => {
  it.each(["User cancelled the request", "Connection CANCELLED", "Request rejected by user"])(
    "maps cancel/rejected messages (%s)",
    (msg) => {
      expect(getConnectHelp(msg)).toBe(REJECTED_HELP)
    },
  )

  it.each(["network error", "Wrong NETWORK selected"])("maps network messages (%s)", (msg) => {
    expect(getConnectHelp(msg)).toBe(NETWORK_HELP)
  })

  it.each(["Freighter is not installed", "Extension not found"])(
    "maps freighter/extension messages (%s)",
    (msg) => {
      expect(getConnectHelp(msg)).toBe(NOT_DETECTED_HELP)
    },
  )

  it("returns the generic help text for unrecognised messages", () => {
    expect(getConnectHelp("Something odd happened")).toBe(DEFAULT_HELP)
    expect(getConnectHelp("")).toBe(DEFAULT_HELP)
  })

  it("checks cancel/rejected before network and freighter", () => {
    expect(getConnectHelp("Freighter rejected the network request")).toBe(REJECTED_HELP)
    expect(getConnectHelp("Freighter network mismatch")).toBe(NETWORK_HELP)
  })
})
