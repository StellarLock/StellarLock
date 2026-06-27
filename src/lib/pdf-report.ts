import type { Lock } from "@/types/lock"
import { formatAmount, formatDateTime, formatUsd, shortAddress } from "@/lib/utils"

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:8px 12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;width:40%">${label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace">${value}</td>
    </tr>`
}

function buildHtml(lock: Lock): string {
  const now = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })
  const vestingRows = lock.vesting
    ? `
    <h2 style="margin:24px 0 8px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280">Vesting Schedule</h2>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      ${row("Vesting start", formatDateTime(lock.vesting.start))}
      ${row("Vesting end", formatDateTime(lock.vesting.end))}
      ${row("Released", `${formatAmount(lock.vesting.released)} ${lock.token.symbol}`)}
    </table>`
    : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>StellarLock Report — Lock #${lock.id}</title>
<style>
  @media print { body { margin:0 } button { display:none } }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; margin:0; padding:32px; font-size:13px }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:16px; margin-bottom:24px }
  .logo { font-size:20px; font-weight:800; letter-spacing:-0.5px }
  .meta { text-align:right; color:#6b7280; font-size:11px }
  h2 { margin:24px 0 8px; font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#6b7280 }
  table { width:100%; border-collapse:collapse; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden }
  .status { display:inline-block; padding:4px 12px; border-radius:999px; font-size:12px; font-weight:600;
    background:${lock.status === "locked" ? "#dcfce7" : lock.status === "unlockable" ? "#fef9c3" : "#f3f4f6"};
    color:${lock.status === "locked" ? "#166534" : lock.status === "unlockable" ? "#854d0e" : "#374151"} }
  .footer { margin-top:40px; padding-top:16px; border-top:1px solid #e5e7eb; color:#9ca3af; font-size:11px; text-align:center }
  .print-btn { position:fixed; top:16px; right:16px; padding:8px 16px; background:#000; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:13px }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Save as PDF</button>
<div class="header">
  <div>
    <div class="logo">StellarLock</div>
    <div style="color:#6b7280;font-size:12px;margin-top:4px">Token Lock Report</div>
  </div>
  <div class="meta">
    <div>Generated: ${now}</div>
    <div style="margin-top:4px">Lock #${lock.id}</div>
    <div style="margin-top:8px"><span class="status">${lock.status.toUpperCase()}</span></div>
  </div>
</div>

<h2>Lock Details</h2>
<table>
  ${row("Lock ID", `#${lock.id}`)}
  ${row("Token", `${lock.token.symbol} — ${lock.token.name}`)}
  ${row("Token contract", lock.token.address)}
  ${row("Locked amount", `${formatAmount(lock.amount)} ${lock.token.symbol}`)}
  ${row("USD value at lock time", formatUsd(lock.usdValue))}
  ${row("Status", lock.status)}
  ${row("Created on", formatDateTime(lock.createdAt))}
  ${row("Unlocks on", formatDateTime(lock.unlockAt))}
  ${row("Extended count", String(lock.extendedCount))}
</table>

<h2>Parties</h2>
<table>
  ${row("Creator", lock.creator)}
  ${row("Beneficiary", lock.beneficiary)}
</table>

${vestingRows}

<h2>On-Chain Verification</h2>
<table>
  ${row("Token contract", lock.token.address)}
  ${row("Verify at", `${window.location.origin}/app/lock/${lock.id}`)}
</table>

<div style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;font-size:12px;color:#6b7280">
  This report was generated client-side from on-chain data. To independently verify this lock, visit the StellarLock explorer
  or query the Soroban contract directly using the token contract address above.
</div>

<div class="footer">
  StellarLock · Soroban smart contracts on Stellar · stellarlock.app<br/>
  Report generated ${now} · Lock #${lock.id} · ${shortAddress(lock.creator)}
</div>
</body>
</html>`
}

export function downloadLockReport(lock: Lock): void {
  const html = buildHtml(lock)
  const blob = new Blob([html], { type: "text/html" })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, "_blank", "noopener")
  if (win) {
    win.addEventListener("load", () => {
      URL.revokeObjectURL(url)
    })
  }
  const filename = `stellarlock-report-${lock.id}-${new Date().toISOString().slice(0, 10)}.html`
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
