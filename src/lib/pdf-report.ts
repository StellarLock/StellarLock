import { jsPDF } from "jspdf"
import type { Lock } from "@/types/lock"
import { formatAmount, formatDateTime, formatUsd, shortAddress } from "@/lib/utils"
import { calculateVestingClaimable } from "@/lib/vesting"

const MARGIN = 14
const PAGE_W = 210 // A4 mm
const CONTENT_W = PAGE_W - MARGIN * 2
const COL_LABEL = MARGIN
const COL_VALUE = MARGIN + CONTENT_W * 0.42

/** Draw a single label/value row and return the next y position. */
function drawRow(doc: jsPDF, y: number, label: string, value: string): number {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128) // muted
  doc.text(label, COL_LABEL, y)

  doc.setFont("helvetica", "normal")
  doc.setTextColor(17, 17, 17)
  // jsPDF types splitTextToSize's return as `any`; it's documented to return
  // string[] when given a single string input.
  const lines = doc.splitTextToSize(value, CONTENT_W - (COL_VALUE - COL_LABEL)) as string[]
  doc.text(lines, COL_VALUE, y)

  const lineH = 6
  const rowH = Math.max(lineH, lines.length * lineH)
  doc.setDrawColor(229, 231, 235)
  doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2)
  return y + rowH + 2
}

/** Draw a section heading and return the next y position. */
function drawHeading(doc: jsPDF, y: number, text: string): number {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(107, 114, 128)
  doc.text(text.toUpperCase(), MARGIN, y)
  return y + 7
}

export function downloadLockReport(lock: Lock): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const now = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.setTextColor(17, 17, 17)
  doc.text("StellarLock", MARGIN, 18)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128)
  doc.text("Token Lock Report", MARGIN, 24)

  doc.setFontSize(8)
  doc.text(`Generated: ${now}`, PAGE_W - MARGIN, 18, { align: "right" })
  doc.text(`Lock #${lock.id}`, PAGE_W - MARGIN, 23, { align: "right" })

  const statusColors: Record<string, [number, number, number]> = {
    locked: [22, 101, 52],
    unlockable: [133, 77, 14],
  }
  const [sr, sg, sb] = statusColors[lock.status] ?? [55, 65, 81]
  doc.setTextColor(sr, sg, sb)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.text(lock.status.toUpperCase(), PAGE_W - MARGIN, 28, { align: "right" })

  doc.setDrawColor(17, 17, 17)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, 32, PAGE_W - MARGIN, 32)

  // ── Lock Details ──────────────────────────────────────────────────────────
  let y = 40
  y = drawHeading(doc, y, "Lock Details")
  y = drawRow(doc, y, "Lock ID", `#${lock.id}`)
  y = drawRow(doc, y, "Token", `${lock.token.symbol} — ${lock.token.name}`)
  y = drawRow(doc, y, "Token contract", lock.token.address)
  y = drawRow(doc, y, "Locked amount", `${formatAmount(lock.amount)} ${lock.token.symbol}`)
  y = drawRow(doc, y, "USD value at lock time", formatUsd(lock.usdValue))
  y = drawRow(doc, y, "Status", lock.status)
  y = drawRow(doc, y, "Created on", formatDateTime(lock.createdAt))
  y = drawRow(doc, y, "Unlocks on", formatDateTime(lock.unlockAt))
  y = drawRow(doc, y, "Extended count", String(lock.extendedCount))

  // ── Parties ───────────────────────────────────────────────────────────────
  y += 4
  y = drawHeading(doc, y, "Parties")
  y = drawRow(doc, y, "Creator", lock.creator)
  y = drawRow(doc, y, "Beneficiary", lock.beneficiary)

  // ── Vesting Schedule ──────────────────────────────────────────────────────
  if (lock.vesting) {
    y += 4
    y = drawHeading(doc, y, "Vesting Schedule")
    y = drawRow(doc, y, "Vesting start", formatDateTime(lock.vesting.start))
    y = drawRow(doc, y, "Vesting end", formatDateTime(lock.vesting.end))
    y = drawRow(doc, y, "Released", `${formatAmount(lock.vesting.released)} ${lock.token.symbol}`)
    const claimableNow = calculateVestingClaimable(lock.amount, lock.token.decimals, lock.vesting)
    y = drawRow(doc, y, "Claimable now", `${formatAmount(claimableNow)} ${lock.token.symbol}`)
  }

  // ── On-Chain Verification ─────────────────────────────────────────────────
  y += 4
  y = drawHeading(doc, y, "On-Chain Verification")
  y = drawRow(doc, y, "Token contract", lock.token.address)
  drawRow(doc, y, "Verify at", `${window.location.origin}/app/lock/${lock.id}`)

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = 285
  doc.setDrawColor(229, 231, 235)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, footerY - 4, PAGE_W - MARGIN, footerY - 4)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(156, 163, 175)
  doc.text(`StellarLock · Soroban smart contracts on Stellar · stellarlock.app`, PAGE_W / 2, footerY, {
    align: "center",
  })
  doc.text(`Report generated ${now} · Lock #${lock.id} · ${shortAddress(lock.creator)}`, PAGE_W / 2, footerY + 4, {
    align: "center",
  })

  const filename = `stellarlock-report-${lock.id}-${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}
