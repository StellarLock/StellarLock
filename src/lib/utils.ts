import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { toast } from "react-hot-toast"

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

/** Format a raw token amount (stroops-style, 7 decimals) into a readable string. */
export function formatAmount(amount: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  const { compact, decimals = 2 } = opts
  if (compact) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(amount)
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  }).format(amount)
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
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

/** Returns true for valid 56-character Stellar contract (C…) or account (G…) addresses. */
export function isValidStellarAddress(addr: string): boolean {
  return addr.length === 56 && (addr.startsWith("C") || addr.startsWith("G"))
}

/** Extracts a readable message from any thrown value. */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null) return JSON.stringify(err, null, 2)
  return String(err)
export const notify = {
  lockCreated: (): string => toast.success("Lock created successfully"),
  withdrawalCompleted: (): string => toast.success("Withdrawal completed"),
  extensionConfirmed: (): string => toast.success("Extension confirmed"),

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
