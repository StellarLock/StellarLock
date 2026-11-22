import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { toast } from "react-hot-toast"

// ── Precision amount helpers ──────────────────────────────────────────────────

/**
 * Convert a human-readable decimal string to base units (bigint) without
 * floating-point arithmetic. Safe for any decimal count including 18-decimal
 * tokens and very large amounts.
 *
 * @param value    - Decimal string, e.g. "12.345"
 * @param decimals - Number of decimal places the token uses (e.g. 7)
 * @returns Base units as bigint, e.g. 12345000n for ("12.345", 7)
 */
export function parseUnits(value: string, decimals: number): bigint {
  if (!value || value.trim() === "") return 0n
  const trimmed = value.trim()
  const [intPart = "0", fracPart = ""] = trimmed.split(".")
  // Pad or truncate fractional part to exactly `decimals` digits
  const frac = fracPart.padEnd(decimals, "0").slice(0, decimals)
  const int = intPart.replace(/^-/, "")
  const isNeg = trimmed.startsWith("-")
  const result = BigInt(int) * BigInt(10 ** decimals) + BigInt(frac)
  return isNeg ? -result : result
}

/**
 * Convert base units (bigint) to a human-readable decimal string without
 * floating-point arithmetic.
 *
 * @param value    - Base units as bigint
 * @param decimals - Number of decimal places the token uses
 * @returns Decimal string, e.g. "12.3450000" for (123450000n, 7)
 */
export function formatUnits(value: bigint, decimals: number): string {
  if (decimals === 0) return value.toString()
  const isNeg = value < 0n
  const abs = isNeg ? -value : value
  const divisor = BigInt(10 ** decimals)
  const intPart = abs / divisor
  const fracPart = abs % divisor
  const frac = fracPart.toString().padStart(decimals, "0")
  return `${isNeg ? "-" : ""}${intPart.toString()}.${frac}`
}

interface Notify {
  message?: string
  code?: string | number
  reason?: string
  data?: { message?: string }
  response?: { data?: { message?: string } }
}
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Truncate a Stellar address / contract id: GABC...WXYZ */
export function shortAddress(addr: string, lead = 4, trail = 4): string {
  if (!addr) return ""
  if (addr.length <= lead + trail + 3) return addr
  return `${addr.slice(0, lead)}…${addr.slice(-trail)}`
}

/**
 * Format a display amount into a readable string.
 * Accepts either a plain JS number (legacy callers) or a bigint base-units +
 * token decimals pair for precision-safe display.
 */
export function formatAmount(
  amount: number | bigint,
  opts: { compact?: boolean; decimals?: number; tokenDecimals?: number } = {},
): string {
  const { compact, decimals = 2 } = opts
  // When a bigint raw amount is supplied together with tokenDecimals, convert
  // it to a number only for the final display step (precision already captured
  // by integer arithmetic above the fold).
  let displayValue: number
  if (typeof amount === "bigint") {
    const td = opts.tokenDecimals ?? 7
    displayValue = Number(formatUnits(amount, td))
  } else {
    displayValue = amount
  }
  if (compact) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(displayValue)
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(displayValue)
}

export function formatUsd(value: number): string {
  const compact = value >= 1_000_000
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: 2,
    minimumFractionDigits: compact ? 2 : undefined,
  }).format(value)
}

/** Returns ms remaining until unlock (negative if unlockable). */
export function msUntil(timestamp: number): number {
  return timestamp - Date.now()
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Extracts a readable message from any thrown value. */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null) return JSON.stringify(err, null, 2)
  return String(err)
}

export const notify = {
  lockCreated: (): string => toast.success("Lock created successfully"),
  withdrawalCompleted: (): string => toast.success("Withdrawal completed"),
  extensionConfirmed: (): string => toast.success("Extension confirmed"),
  transferConfirmed: (): string => toast.success("Beneficiary transfer confirmed"),
  bulkCompleted: (action: "extension" | "transfer", succeeded: number, failed: number): string => {
    const label = action === "extension" ? "extension" : "transfer"
    if (failed === 0) return toast.success(`${succeeded} ${label}${succeeded === 1 ? "" : "s"} completed`)
    if (succeeded === 0) return toast.error(`No ${label}s completed`)
    return toast.error(`${succeeded} ${label}${succeeded === 1 ? "" : "s"} completed, ${failed} failed`)
  },

  error: (err: unknown): string => {
    const error = err as Notify
    if (!navigator.onLine || error.message?.includes("NetworkError") || error.code === "ERR_NETWORK") {
      return toast.error("Network error: Please check your internet connection.")
    }
    if (error.reason || error.data?.message) {
      const txError = error.reason || error.data?.message
      return toast.error(`Transaction Failed: ${txError}`)
    }
    const Message = error.response?.data?.message || error.message || "An unexpected error occurred."
    return toast.error(Message)
  },
}
