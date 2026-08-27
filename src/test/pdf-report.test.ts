import { describe, it, expect, vi, beforeEach } from "vitest"
import { downloadLockReport } from "@/lib/pdf-report"
import type { Lock } from "@/types/lock"

const { MockJsPDF, getInstances } = vi.hoisted(() => {
  const instances: MockJsPDF[] = []
  class MockJsPDF {
    text = vi.fn()
    setFont = vi.fn()
    setFontSize = vi.fn()
    setTextColor = vi.fn()
    setDrawColor = vi.fn()
    setLineWidth = vi.fn()
    line = vi.fn()
    splitTextToSize = vi.fn((value: string) => [value])
    save = vi.fn()
    constructor() {
      instances.push(this)
    }
  }
  return { MockJsPDF, getInstances: () => instances }
})

vi.mock("jspdf", () => ({ jsPDF: MockJsPDF }))

const CREATOR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
const BENEFICIARY = "GD6ROJBYLKQMOW3E7N4M2YBPUHMZD7PL65VRHRMO24BOVSBV5H3BQRSL"
const TOKEN_ADDR = "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW"

function makeLock(overrides: Partial<Lock> = {}): Lock {
  return {
    id: "42",
    kind: "token",
    status: "locked",
    token: { address: TOKEN_ADDR, symbol: "USDC", name: "USD Coin", decimals: 6 },
    creator: CREATOR,
    beneficiary: BENEFICIARY,
    amount: 1000,
    usdValue: 1000,
    createdAt: 1_700_000_000_000,
    unlockAt: 9_999_999_999_000,
    extendedCount: 0,
    ...overrides,
  }
}

/** Flatten every string argument passed to the mock's text() calls. */
function renderedStrings(): string[] {
  const doc = getInstances().at(-1)!
  // text() is called with plain strings (labels) and with the string[] returned
  // by splitTextToSize (values), so flatten recursively before filtering.
  return doc.text.mock.calls.flat(Infinity).filter((c): c is string => typeof c === "string")
}

describe("pdf-report", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the report header, lock details, parties and on-chain verification", () => {
    downloadLockReport(makeLock())
    const strings = renderedStrings()

    // Header
    expect(strings).toContain("StellarLock")
    expect(strings).toContain("Token Lock Report")
    expect(strings).toContain("LOCKED") // status, uppercased

    // Sections
    expect(strings).toContain("LOCK DETAILS")
    expect(strings).toContain("PARTIES")
    expect(strings).toContain("ON-CHAIN VERIFICATION")

    // Lock details rows
    expect(strings).toContain("#42")
    expect(strings).toContain("USDC — USD Coin")
    expect(strings).toContain(TOKEN_ADDR)
    expect(strings).toContain("Locked amount")
    expect(strings).toContain("Extended count")
    expect(strings).toContain(CREATOR)
    expect(strings).toContain(BENEFICIARY)

    // Verify-at link uses the current origin
    expect(strings).toContain(`${window.location.origin}/app/lock/42`)
  })

  it("includes the vesting schedule section when the lock has vesting", () => {
    downloadLockReport(
      makeLock({
        vesting: { start: 1_700_000_000_000, end: 1_800_000_000_000, released: 250 },
      }),
    )
    const strings = renderedStrings()
    expect(strings).toContain("VESTING SCHEDULE")
    expect(strings).toContain("Vesting start")
    expect(strings).toContain("Vesting end")
    expect(strings).toContain("Released")
  })

  it("omits the vesting section when the lock has no vesting", () => {
    downloadLockReport(makeLock())
    expect(renderedStrings()).not.toContain("VESTING SCHEDULE")
  })

  it("saves the file with a date-stamped filename containing the lock id", () => {
    downloadLockReport(makeLock())
    const doc = getInstances().at(-1)!
    expect(doc.save).toHaveBeenCalledTimes(1)
    const filename = doc.save.mock.calls[0][0] as string
    expect(filename).toMatch(/^stellarlock-report-42-\d{4}-\d{2}-\d{2}\.pdf$/)
  })

  it("uses the status-specific colour for known statuses", () => {
    downloadLockReport(makeLock({ status: "locked" }))
    const doc = getInstances().at(-1)!
    expect(doc.setTextColor).toHaveBeenCalledWith(22, 101, 52) // green
  })

  it("falls back to a neutral grey for unknown statuses (edge case)", () => {
    downloadLockReport(makeLock({ status: "withdrawn" as Lock["status"] }))
    const doc = getInstances().at(-1)!
    expect(doc.setTextColor).toHaveBeenCalledWith(55, 65, 81) // default grey
  })

  it("wraps long values with splitTextToSize so rows never overflow the page width", () => {
    const longAddress = "C" + "A".repeat(54) // very long contract address
    downloadLockReport(makeLock({ token: { ...makeLock().token, address: longAddress } }))
    const doc = getInstances().at(-1)!
    expect(doc.splitTextToSize).toHaveBeenCalled()
    const wrappedValues = doc.splitTextToSize.mock.calls.map((c) => c[0])
    expect(wrappedValues).toContain(longAddress)
  })
})
