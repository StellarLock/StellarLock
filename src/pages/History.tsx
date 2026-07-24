import { Link } from "react-router-dom"
import { ExternalLink, Lock as LockIcon, Droplets, Unlock, Repeat, History as HistoryIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWallet } from "@/hooks/useWallet"
import { useTransactionHistory } from "@/hooks/useTransactionHistory"
import { ConnectGate } from "@/components/layout/ConnectGate"
import { Card } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { shortAddress, formatAmount, formatDateTime } from "@/lib/utils"
import { txExplorerLink } from "@/lib/stellar"
import type { TransactionRecord, TransactionAction, TransactionStatus } from "@/types/transaction"

const ACTION_ICONS: Record<TransactionAction, typeof LockIcon> = {
  create_token_lock: LockIcon,
  create_lp_lock: Droplets,
  withdraw: Unlock,
  extend: Repeat,
}

export function History() {
  const { t } = useTranslation()
  const { address } = useWallet()
  const records = useTransactionHistory(address)

  return (
    <ConnectGate title={t("connectGate.title")}>
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <header>
          <h1 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">{t("history.title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("history.subtitle")}</p>
        </header>

        {records.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <HistoryIcon className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">{t("history.emptyTitle")}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t("history.emptyDesc")}</p>
          </div>
        ) : (
          <Card className="mt-8 divide-y divide-border overflow-hidden">
            {records.map((record) => (
              <TransactionRow key={record.hash} record={record} />
            ))}
          </Card>
        )}
      </div>
    </ConnectGate>
  )
}

function TransactionRow({ record }: { record: TransactionRecord }) {
  const { t } = useTranslation()
  const Icon = ACTION_ICONS[record.action]

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="font-medium">
            {t(`history.action.${record.action}`)}
            {record.lockId && record.lockId !== "pending" && (
              <Link to={`/app/lock/${record.lockId}`} className="ml-2 text-sm text-primary hover:underline">
                #{record.lockId}
              </Link>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {record.amount !== undefined && `${formatAmount(record.amount)} · `}
            {record.token && shortAddress(record.token)}
            {record.token && " · "}
            {formatDateTime(record.createdAt)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:justify-end">
        <StatusPill status={record.status} />
        <a
          href={txExplorerLink(record.hash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label={t("history.viewOnExplorer")}
        >
          {shortAddress(record.hash, 6, 6)}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: TransactionStatus }) {
  const { t } = useTranslation()
  const variant = status === "success" ? "success" : status === "failed" ? "destructive" : "warning"
  return <Badge variant={variant}>{t(`history.status.${status}`)}</Badge>
}
