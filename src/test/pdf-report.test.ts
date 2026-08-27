import { describe, it, expect, vi, beforeEach } from "vitest"
import { downloadLockReport } from "@/lib/pdf-report"
import { mockLock } from "./mocks"
import type { Lock } from "@/types/lock"

// Fully mock jspdf so the report renderer is exercised without touching a real
// PDF/canvas backend. The fake records every doc.text call and the save target.
const mocks = vi.hoisted(() => {
  class FakeJsPdf {
    texts: string[] = []
    save = vi.fn(() => undefined as never)

    setFont() {
      return this
    }
    setFontSize() {
      return this
    }
    setTextColor() {
      return this
    }
    setDrawColor() {
      return this
    }
    setLineWidth() {
      return this
    }
    line() {
      return this
    }
    text(value: string | string[]) {
      if (Array.isArray(value)) this.texts.push(...value)
      else this.texts.push(value)
      return this
    }
    splitTextToSize(value: string) {
      return [value]
    }
  }
  return { FakeJsPdf }
})

vi.mock("jspdf", () => ({ jsPDF: vi.fn(() => new mocks.FakeJsPdf()) }))

// Each call creates a fresh instance; read the text buffer off the last one.
function lastInstanceTexts(): string[] {
  const calls = (vi.mocked(jsPDFFactory()).mock.results ?? []) as Array<{ value: InstanceType<typeof mocks.FakeJsPdf> }>
  const last = calls[calls.length - 1]?.value
  return last ? last.texts : []
}

import { jsPDF } from "jspdf"
function jsPDFFactory(): ReturnType<typeof vi.fn> {
  return vi.mocked(jsPDF)
}

function lockWithVesting(overrides: Partial<Lock> = {}): Lock {
  return {
    ...mockLock,
    vesting: {
      start: mockLock.createdAt,
      end: mockLock.unlockAt,
      released: 250,
    },
    ...overrides,
  }
}

describe("downloadLockReport", () => {
  beforeEach(() => {
    jsPDFFactory().mockClear()
  })

  it("saves a PDF with the expected report filename", () => {
    downloadLockReport(mockLock)
    const saveCalls = (lastInstance().save as ReturnType<typeof vi.fn>).mock.calls
    expect(saveCalls).toHaveLength(1)
    const filename = String(saveCalls[0][0])
    expect(filename).toMatch(/^stellarlock-report-\d+-\d{4}-\d{2}-\d{2}\.pdf$/)
  })

  it("renders the report header and lock id", () => {
    downloadLockReport(mockLock)
    const texts = lastInstanceTexts()
    expect(texts).toContain("StellarLock")
    expect(texts).toContain("Token Lock Report")
    expect(texts).toContain(`Lock #${mockLock.id}`)
  })

  it("renders lock details including token, amount, and status", () => {
    downloadLockReport(mockLock)
    const texts = lastInstanceTexts().join(" ")
    expect(texts).toContain(mockLock.token.symbol)
    expect(texts).toContain(mockLock.token.name)
    expect(texts).toContain(mockLock.status)
    expect(texts).toContain("Creator")
    expect(texts).toContain("Beneficiary")
  })

  it("renders a vesting schedule section when the lock has vesting", () => {
    downloadLockReport(lockWithVesting())
    const texts = lastInstanceTexts()
    expect(texts.some((t) => t.toLowerCase().includes("vesting schedule"))).toBe(true)
    expect(texts.some((t) => t.toLowerCase().includes("vesting start"))).toBe(true)
  })

  it("omits the vesting schedule section for a lock without vesting", () => {
    downloadLockReport({ ...mockLock, vesting: undefined })
    const texts = lastInstanceTexts()
    expect(texts.some((t) => t.toLowerCase().includes("vesting schedule"))).toBe(false)
  })

  it("renders an on-chain verification link using the current origin", () => {
    downloadLockReport(mockLock)
    const texts = lastInstanceTexts()
    expect(texts.some((t) => t.includes("Verify at"))).toBe(true)
    expect(texts.some((t) => t.includes(window.location.origin))).toBe(true)
  })
})

function lastInstance(): InstanceType<typeof mocks.FakeJsPdf> {
  const results = jsPDFFactory().mock.results as Array<{
    value: InstanceType<typeof mocks.FakeJsPdf>
  }>
  return results[results.length - 1].value
}
