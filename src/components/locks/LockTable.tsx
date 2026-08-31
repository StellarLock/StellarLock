import { Link } from "react-router-dom"
import { ArrowRight, Repeat } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { Lock } from "@/types/lock"
import { Card } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { DexBadge } from "@/components/ui/DexBadge"
import { CountdownTimer } from "@/components/ui/CountdownTimer"
import { TokenAvatar } from "@/components/ui/TokenAvatar"
import { VerifiedBadge } from "@/components/ui/VerifiedBadge"
import { useVerifiedToken } from "@/hooks/useVerifiedToken"
import { formatAmount, formatDate, formatUsdValue, shortAddress, cn } from "@/lib/utils"
import { CopyButton } from "@/components/ui/CopyButton"

interface LockTableRowProps {
  lock: Lock
  selectable: boolean
  selected: boolean
  onSelect: (id: string, checked: boolean) => void
}

function LockTableRow({ lock, selectable, selected, onSelect }: LockTableRowProps) {
  const { t } = useTranslation()
  const verified = useVerifiedToken(lock.token.address)

  const rowContent = (
    <tr
      className={cn(
        "group border-b border-border transition-colors last:border-b-0",
        selected ? "bg-primary/5" : "hover:bg-secondary/40",
        selectable && "cursor-pointer",
      )}
      onClick={selectable ? () => onSelect(lock.id, !selected) : undefined}
      aria-selected={selectable ? selected : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={selectable ? (e) => e.key === " " && onSelect(lock.id, !selected) : undefined}
    >
      {selectable && (
        <td className="w-10 px-4 py-3.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation()
              onSelect(lock.id, e.target.checked)
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 accent-[oklch(0.78_0.16_175)] cursor-pointer"
            aria-label={`Select lock ${lock.id}`}
          />
        </td>
      )}

      {/* Token */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <TokenAvatar symbol={lock.token.symbol} contractId={lock.token.address} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm leading-none">{lock.token.symbol}</span>
              {lock.kind === "lp" && lock.dex && <DexBadge dex={lock.dex} />}
              <VerifiedBadge verified={verified} showUnverified={false} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[120px]">{lock.token.name}</p>
          </div>
        </div>
      </td>

      {/* Amount */}
      <td className="px-4 py-3.5 tabular-nums">
        <span className="font-semibold text-sm">{formatAmount(lock.amount, { compact: true })}</span>
        <p className="text-xs text-muted-foreground">{formatUsdValue(lock.token.address, lock.usdValue)}</p>
      </td>

      {/* Beneficiary */}
      <td className="hidden px-4 py-3.5 sm:table-cell">
        <span className="flex items-center gap-1 font-mono text-xs">
          {shortAddress(lock.beneficiary, 6, 4)}
          <CopyButton text={lock.beneficiary} />
        </span>
      </td>

      {/* Unlock date */}
      <td className="hidden px-4 py-3.5 text-sm text-muted-foreground md:table-cell">{formatDate(lock.unlockAt)}</td>

      {/* Countdown */}
      <td className="hidden px-4 py-3.5 lg:table-cell">
        <CountdownTimer target={lock.unlockAt} compact className="text-sm" />
      </td>

      {/* Status + extras */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <StatusBadge status={lock.status} />
          {lock.extendedCount > 0 && (
            <span className="hidden items-center gap-0.5 text-xs text-muted-foreground sm:inline-flex">
              <Repeat className="h-3 w-3" />
              {lock.extendedCount}×
            </span>
          )}
        </div>
      </td>

      {/* View link — only shown when not in selectable mode */}
      {!selectable && (
        <td className="pr-4 py-3.5 text-right">
          <Link
            to={`/app/lock/${lock.kind ?? "token"}/${lock.id}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
            aria-label={`${t("lockCard.view")} lock ${lock.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            {t("lockCard.view")}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </td>
      )}
    </tr>
  )

  // When not selectable, wrap the whole row as a link is not possible in HTML,
  // so we rely on the view link column above. For selectable mode the row
  // click handler drives selection.
  return rowContent
}

interface LockTableProps {
  locks: Lock[]
  selectable?: boolean
  selectedIds?: Set<string>
  onSelect?: (id: string, checked: boolean) => void
}

export function LockTable({ locks, selectable = false, selectedIds = new Set(), onSelect = () => {} }: LockTableProps) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left" role="table">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {selectable && <th className="w-10 px-4 py-3" scope="col" aria-label="Select" />}
              <th
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                scope="col"
              >
                Token
              </th>
              <th
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                scope="col"
              >
                Amount
              </th>
              <th
                className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell"
                scope="col"
              >
                Beneficiary
              </th>
              <th
                className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell"
                scope="col"
              >
                Unlock date
              </th>
              <th
                className="hidden px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell"
                scope="col"
              >
                Unlocks in
              </th>
              <th
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                scope="col"
              >
                Status
              </th>
              {!selectable && <th className="pr-4 py-3" scope="col" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {locks.map((lock) => (
              <LockTableRow
                key={lock.id}
                lock={lock}
                selectable={selectable}
                selected={selectedIds.has(lock.id)}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
