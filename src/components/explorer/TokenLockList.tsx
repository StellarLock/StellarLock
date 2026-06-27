import { Link } from "react-router-dom"
import { ExternalLink } from "lucide-react"
import type { Lock } from "@/types/lock"
import { Card } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { DexBadge } from "@/components/ui/DexBadge"
import { CountdownTimer } from "@/components/ui/CountdownTimer"
import { Badge } from "@/components/ui/Badge"
import { VerifiedBadge } from "@/components/ui/VerifiedBadge"
import { useVerifiedToken } from "@/hooks/useVerifiedToken"
import { formatAmount, formatDate, formatUsd, shortAddress } from "@/lib/utils"
import { CopyButton } from "@/components/ui/CopyButton"

function LockRow({ lock }: { lock: Lock }) {
  const verified = useVerifiedToken(lock.token.address)
  return (
    <li className="grid grid-cols-1 gap-3 border-b border-border px-5 py-4 last:border-b-0 transition-colors hover:bg-secondary/40 md:grid-cols-12 md:items-center md:gap-4">
      <div className="col-span-3 flex flex-col gap-1">
        <span className="font-semibold tabular-nums">{formatAmount(lock.amount, { compact: true })}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {formatUsd(lock.usdValue)}
          {lock.kind === "lp" && lock.dex && <DexBadge dex={lock.dex} />}
          {lock.extendedCount > 0 && <Badge variant="outline">{lock.extendedCount}× extended</Badge>}
          <VerifiedBadge verified={verified} showUnverified={true} />
        </span>
      </div>

      <div className="col-span-3 flex items-center gap-1 font-mono text-sm">
        <span className="md:hidden text-xs text-muted-foreground">Beneficiary: </span>
        {shortAddress(lock.beneficiary, 6, 6)}
        <CopyButton text={lock.beneficiary} />
      </div>

      <div className="col-span-2 text-sm text-muted-foreground">
        <span className="md:hidden text-xs">Unlock: </span>
        {formatDate(lock.unlockAt)}
      </div>

      <div className="col-span-2 text-sm">
        <CountdownTimer target={lock.unlockAt} compact />
      </div>

      <div className="col-span-2 flex items-center justify-between gap-2 md:justify-end">
        <StatusBadge status={lock.status} />
        <Link
          to={`/app/lock/${lock.id}`}
          className="text-muted-foreground transition-colors hover:text-primary"
          aria-label={`View lock ${lock.id}`}
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </li>
  )
}

export function TokenLockList({ locks }: { locks: Lock[] }) {
  const sorted = [...locks].sort((a, b) => a.unlockAt - b.unlockAt)

  return (
    <Card className="overflow-hidden">
      {/* header row (desktop) */}
      <div className="hidden grid-cols-12 gap-4 border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
        <span className="col-span-3">Amount</span>
        <span className="col-span-3">Beneficiary</span>
        <span className="col-span-2">Unlock date</span>
        <span className="col-span-2">Unlocks in</span>
        <span className="col-span-2 text-right">Status</span>
      </div>

      <ul>
        {sorted.map((lock) => (
          <li
            key={lock.id}
            className="grid grid-cols-1 gap-3 border-b border-border px-5 py-4 last:border-b-0 transition-colors hover:bg-secondary/40 md:grid-cols-12 md:items-center md:gap-4"
          >
            <div className="col-span-3 flex flex-col gap-1">
              <span className="font-semibold tabular-nums">{formatAmount(lock.amount, { compact: true })}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {formatUsd(lock.usdValue)}
                {lock.kind === "lp" && lock.dex && <DexBadge dex={lock.dex} />}
                {lock.extendedCount > 0 && <Badge variant="outline">{lock.extendedCount}× extended</Badge>}
              </span>
              {lock.metadata?.description && (
                <span className="text-xs text-muted-foreground line-clamp-1">{lock.metadata.description}</span>
              )}
            </div>

            <div className="col-span-3 flex items-center gap-1 font-mono text-sm">
              <span className="md:hidden text-xs text-muted-foreground">Beneficiary: </span>
              {shortAddress(lock.beneficiary, 6, 6)}
              <CopyButton text={lock.beneficiary} />
            </div>

            <div className="col-span-2 text-sm text-muted-foreground">
              <span className="md:hidden text-xs">Unlock: </span>
              {formatDate(lock.unlockAt)}
            </div>

            <div className="col-span-2 text-sm">
              <CountdownTimer target={lock.unlockAt} compact />
            </div>

            <div className="col-span-2 flex items-center justify-between gap-2 md:justify-end">
              <StatusBadge status={lock.status} />
              <Link
                to={`/app/lock/${lock.id}`}
                className="text-muted-foreground transition-colors hover:text-primary"
                aria-label={`View lock ${lock.id}`}
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </li>
          <LockRow key={lock.id} lock={lock} />
        ))}
      </ul>
    </Card>
  )
}
