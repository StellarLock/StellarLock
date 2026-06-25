import { Link } from "react-router-dom"
import { ArrowRight, Repeat } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { Lock } from "@/types/lock"
import { Card } from "@/components/ui/Card"
import { TokenAvatar } from "@/components/ui/TokenAvatar"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { DexBadge } from "@/components/ui/DexBadge"
import { CountdownTimer } from "@/components/ui/CountdownTimer"
import { LockProgressBar } from "@/components/ui/LockProgressBar"
import { formatAmount, formatUsd, shortAddress } from "@/lib/utils"

export function LockCard({ lock }: { lock: Lock }) {
  const { t } = useTranslation()

  return (
    <Link to={`/app/lock/${lock.id}`} className="group block">
      <Card className="p-5 transition-colors hover:border-primary/40">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <TokenAvatar symbol={lock.token.symbol} contractId={lock.token.address} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{lock.token.symbol}</span>
                {lock.kind === "lp" && lock.dex && <DexBadge dex={lock.dex} />}
              </div>
              <p className="truncate text-sm text-muted-foreground">{lock.token.name}</p>
            </div>
          </div>
          <StatusBadge status={lock.status} />
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("lockCard.lockedAmount")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatAmount(lock.amount, { compact: true })}{" "}
              <span className="text-sm font-normal text-muted-foreground">({formatUsd(lock.usdValue)})</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t("lockCard.unlocksIn")}</p>
            <CountdownTimer target={lock.unlockAt} compact className="text-sm font-medium" />
          </div>
        </div>

        <div className="mt-4">
          <LockProgressBar createdAt={lock.createdAt} unlockAt={lock.unlockAt} showLabel={false} />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-3">
            <span>{t("lockCard.lock", { id: lock.id })}</span>
            <span className="font-mono">{shortAddress(lock.beneficiary)}</span>
            {lock.extendedCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3 w-3" />
                {lock.extendedCount}×
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 text-primary opacity-0 transition-opacity group-hover:opacity-100">
            {t("lockCard.view")} <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </Card>
    </Link>
  )
}
