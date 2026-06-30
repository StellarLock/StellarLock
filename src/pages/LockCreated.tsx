/**
 * LockCreated — transaction receipt / confirmation page shown immediately
 * after a lock is successfully created.
 *
 * Data is received via React Router's location.state so it survives a
 * navigation without touching the URL query string.  If the page is reached
 * without state (e.g. a direct link) the user is redirected to /app/create.
 */

import { useEffect } from "react"
import { useLocation, useNavigate, Link } from "react-router-dom"
import { CheckCircle2, Copy, ExternalLink, ArrowRight, PlusCircle } from "lucide-react"
import { Helmet } from "react-helmet-async"
import { useTranslation } from "react-i18next"
import { toast } from "react-hot-toast"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { NETWORK } from "@/lib/stellar"
import { formatDate } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LockCreatedState {
  /** On-chain lock id */
  lockId: string
  /** "token" | "lp" */
  lockKind: "token" | "lp"
  /** Transaction hash returned from the Stellar network */
  txHash: string
  /** Token / pool contract address */
  tokenAddress: string
  /** Token symbol for display */
  tokenSymbol?: string
  /** Locked amount (in token units) */
  amount: string
  /** Beneficiary address */
  beneficiary: string
  /** Creator address */
  creator: string
  /** Unlock timestamp in unix ms */
  unlockAt: number
  /** Whether a vesting schedule was attached */
  vesting?: boolean
  /** Ledger close time in unix ms (optional, from tx result) */
  timestamp?: number
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LockCreated() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  const state = location.state as LockCreatedState | null

  // Redirect to create form if navigated here without state
  useEffect(() => {
    if (!state?.lockId) {
      navigate("/app/create", { replace: true })
    }
  }, [state, navigate])

  if (!state?.lockId) {
    return null // will redirect via useEffect
  }

  const { lockId, lockKind, txHash, tokenAddress, tokenSymbol, amount, beneficiary, creator, unlockAt, vesting, timestamp } =
    state

  const lockPath = `/app/lock/${lockKind}/${lockId}`
  const stellarExpertUrl = `https://stellar.expert/explorer/${NETWORK.networkName}/tx/${txHash}`
  const shareUrl = `${window.location.origin}${lockPath}`

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied!`)
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Helmet>
        <title>Lock Created | StellarLock</title>
        <meta name="description" content="Your lock has been created successfully on Stellar." />
      </Helmet>

      {/* Success header */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Lock Created!</h1>
        <p className="text-sm text-muted-foreground">
          Your tokens are now locked on-chain.{" "}
          {vesting && <span>A vesting schedule is active.</span>}
        </p>
      </div>

      {/* Lock summary card */}
      <Card className="mb-4 divide-y divide-border overflow-hidden p-0">
        <div className="bg-secondary/40 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lock Summary</p>
        </div>

        <DetailRow label="Lock ID">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{lockId}</span>
            <button
              type="button"
              aria-label="Copy lock ID"
              onClick={() => copyToClipboard(lockId, "Lock ID")}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </DetailRow>

        <DetailRow label="Type">
          <Badge variant={lockKind === "lp" ? "secondary" : "primary"}>
            {lockKind === "lp" ? "LP Lock" : "Token Lock"}
          </Badge>
        </DetailRow>

        <DetailRow label="Token">
          <span className="font-mono text-sm">
            {tokenSymbol ? (
              <span>
                <span className="font-semibold">{tokenSymbol}</span>{" "}
                <span className="text-muted-foreground">{tokenAddress.slice(0, 8)}…</span>
              </span>
            ) : (
              tokenAddress
            )}
          </span>
        </DetailRow>

        <DetailRow label="Amount">
          <span className="font-semibold tabular-nums">
            {amount} {tokenSymbol ?? ""}
          </span>
        </DetailRow>

        <DetailRow label="Beneficiary">
          <span className="font-mono text-sm">{beneficiary}</span>
        </DetailRow>

        <DetailRow label="Creator">
          <span className="font-mono text-sm">{creator}</span>
        </DetailRow>

        <DetailRow label="Unlock date">
          <span className="text-sm">{formatDate(unlockAt)}</span>
        </DetailRow>

        {vesting && (
          <DetailRow label="Vesting">
            <Badge variant="outline">Linear vesting enabled</Badge>
          </DetailRow>
        )}

        {timestamp && (
          <DetailRow label="Created at">
            <span className="text-sm">{new Date(timestamp).toLocaleString()}</span>
          </DetailRow>
        )}
      </Card>

      {/* Transaction details card */}
      <Card className="mb-6 divide-y divide-border overflow-hidden p-0">
        <div className="bg-secondary/40 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transaction Details</p>
        </div>

        <DetailRow label="TX Hash">
          <div className="flex items-center gap-2">
            <span className="max-w-[200px] truncate font-mono text-xs">{txHash}</span>
            <button
              type="button"
              aria-label="Copy transaction hash"
              onClick={() => copyToClipboard(txHash, "Transaction hash")}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <a
              href={stellarExpertUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="View transaction on Stellar Expert"
              className="rounded p-1 text-muted-foreground transition-colors hover:text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </DetailRow>

        <DetailRow label="Network">
          <Badge variant="outline">{NETWORK.displayName}</Badge>
        </DetailRow>
      </Card>

      {/* Share */}
      <Card className="mb-6 p-4">
        <p className="mb-2 text-sm font-medium">Share this lock</p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 font-mono text-xs text-muted-foreground">
          <span className="flex-1 truncate">{shareUrl}</span>
          <button
            type="button"
            aria-label="Copy shareable link"
            onClick={() => copyToClipboard(shareUrl, "Link")}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </Card>

      {/* Next steps */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="flex-1">
          <Link to={lockPath}>
            <ArrowRight className="h-4 w-4" />
            View Lock Detail
          </Link>
        </Button>

        <Button asChild variant="outline" size="lg" className="flex-1">
          <Link to="/app/create">
            <PlusCircle className="h-4 w-4" />
            Create Another
          </Link>
        </Button>
      </div>
    </div>
  )
}

// ── Detail row helper ─────────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}
