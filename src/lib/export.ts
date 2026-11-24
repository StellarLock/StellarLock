import { Lock } from "@/types/lock"
import { formatDate, formatAmount, formatUsd, formatUnits } from "./utils"

export function exportToJSON(locks: Lock[], filename = "locks.json"): void {
  const data = locks.map((lock) => ({
    id: lock.id,
    kind: lock.kind,
    status: lock.status,
    token: {
      address: lock.token.address,
      symbol: lock.token.symbol,
      name: lock.token.name,
      decimals: lock.token.decimals,
    },
    creator: lock.creator,
    beneficiary: lock.beneficiary,
    // Export as human-readable decimal string for readability
    amount: formatUnits(lock.amount, lock.token.decimals),
    usdValue: lock.usdValue,
    createdAt: lock.createdAt,
    createdDate: formatDate(lock.createdAt),
    unlockAt: lock.unlockAt,
    unlockDate: formatDate(lock.unlockAt),
    extendedCount: lock.extendedCount,
    dex: lock.dex,
    poolPair: lock.poolPair,
    vesting: lock.vesting
      ? {
          ...lock.vesting,
          released: formatUnits(lock.vesting.released, lock.token.decimals),
        }
      : undefined,
    metadata: lock.metadata,
  }))

  const json = JSON.stringify(data, null, 2)
  downloadFile(json, filename, "application/json")
}

export function exportToCSV(locks: Lock[], filename = "locks.csv"): void {
  const headers = [
    "Lock ID",
    "Kind",
    "Status",
    "Token Symbol",
    "Token Name",
    "Amount",
    "USD Value",
    "Created Date",
    "Unlock Date",
    "Days Until Unlock",
    "Creator",
    "Beneficiary",
    "Extended Count",
    "DEX",
    "Pool Pair",
    "Has Vesting",
  ]

  const rows = locks.map((lock) => {
    const daysUntilUnlock = Math.ceil((lock.unlockAt - Date.now()) / (1000 * 60 * 60 * 24))
    const poolPair = lock.poolPair ? lock.poolPair.join(" / ") : ""
    return [
      lock.id,
      lock.kind,
      lock.status,
      lock.token.symbol,
      lock.token.name,
      formatAmount(lock.amount, { compact: false, tokenDecimals: lock.token.decimals }),
      formatUsd(lock.usdValue),
      formatDate(lock.createdAt),
      formatDate(lock.unlockAt),
      daysUntilUnlock,
      lock.creator,
      lock.beneficiary,
      lock.extendedCount,
      lock.dex || "",
      poolPair,
      lock.vesting ? "Yes" : "No",
    ]
  })

  const csvContent =
    [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            const str = String(cell)
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          })
          .join(","),
      )
      .join("\n") + "\n"

  downloadFile(csvContent, filename, "text/csv;charset=utf-8")
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
