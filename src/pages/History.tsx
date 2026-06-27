import { useEffect, useState } from "react"
import { ExternalLink, Clock, CheckCircle2, XCircle, Copy, Trash2 } from "lucide-react"
import { Helmet } from "react-helmet-async"
import { useTranslation } from "react-i18next"
import {
  getTransactions,
  refreshPendingStatuses,
  clearTransactions,
  stellarExpertLink,
} from "@/lib/transaction-history"
import type { TransactionRecord, TxType, TxStatus } from "@/types/transaction"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { cn, formatDateTime } from "@/lib/utils"
import toast from "react-hot-toast"

export function History() {
  const { t } = useTranslation()
  const [records, setRecords] = useState<TransactionRecord[]>([])
  const [typeFilter, setTypeFilter] = useState<TxType | "all">("all")
  const [statusFilter, setStatusFilter] = useState<TxStatus | "all">("all")
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setRecords(getTransactions())
    let active = true
    setRefreshing(true)
    refreshPendingStatuses()
      .then((updated) => { if (active) setRecords(updated) })
      .finally(() => { if (active) setRefreshing(false) })
    return () => { active = false }
  }, [])

  const filtered = records.filter((r) => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false
    if (statusFilter !== "all" && r.status !== statusFilter) return false
    return true
  })

  function handleClear() {
    clearTransactions()
    setRecords([])
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
      <Helmet>
        <title>Transaction History | StellarLock</title>
        <meta name="description" content="View your StellarLock transaction history." />
      </Helmet>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("history.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("history.subtitle")}</p>
        </div>
        {records.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4" />
            Clear all
          </Button>
        )}
      </header>

      {/* Filters */}
      {records.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TxType | "all")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label={t("history.filterType")}
          >
            <option value="all">{t("history.filterAll")} {t("history.filterType")}</option>
            <option value="create_lock">{t("history.typeCreateLock")}</option>
            <option value="split_lock">{t("history.typeSplitLock")}</option>
            <option value="withdraw">{t("history.typeWithdraw")}</option>
            <option value="extend">{t("history.typeExtend")}</option>
            <option value="transfer">{t("history.typeTransfer")}</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TxStatus | "all")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label={t("history.filterStatus")}
          >
            <option value="all">{t("history.filterAll")} {t("history.filterStatus")}</option>
            <option value="pending">{t("history.statusPending")}</option>
            <option value="success">{t("history.statusSuccess")}</option>
            <option value="failed">{t("history.statusFailed")}</option>
          </select>
          {refreshing && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 animate-spin" />
              Checking statuses…
            </span>
          )}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <Clock className="h-10 w-10 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold">
            {records.length === 0 ? t("history.empty") : "No results match your filters"}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {records.length === 0 ? t("history.emptyDesc") : "Try changing the type or status filter."}
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {filtered.map((record) => (
            <TxRow key={record.hash} record={record} onCopy={() => toast.success("Hash copied")} />
          ))}
        </div>
      )}

      {records.length > 0 && (
        <p className="mt-6 text-center text-xs text-muted-foreground">{t("history.cleanupNote")}</p>
      )}
    </div>
  )
}

const TYPE_LABELS: Record<TxType, string> = {
  create_lock: "history.typeCreateLock",
  split_lock: "history.typeSplitLock",
  withdraw: "history.typeWithdraw",
  extend: "history.typeExtend",
  transfer: "history.typeTransfer",
}

function StatusIcon({ status }: { status: TxStatus }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-success" />
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />
  return <Clock className="h-4 w-4 animate-spin text-muted-foreground" />
}

function TxRow({ record, onCopy }: { record: TransactionRecord; onCopy: () => void }) {
  const { t } = useTranslation()
  const short = `${record.hash.slice(0, 8)}…${record.hash.slice(-6)}`

  function copyHash() {
    navigator.clipboard.writeText(record.hash).then(onCopy)
  }

  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex items-center gap-2">
        <StatusIcon status={record.status} />
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 text-xs",
            record.status === "success" && "border-success/40 text-success",
            record.status === "failed" && "border-destructive/40 text-destructive",
          )}
        >
          {t(TYPE_LABELS[record.type])}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-mono text-sm">{short}</span>
        {record.lockId && (
          <span className="text-xs text-muted-foreground">Lock #{record.lockId}</span>
        )}
      </div>

      <span className="shrink-0 text-xs text-muted-foreground">
        {formatDateTime(record.timestamp)}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={copyHash}
          aria-label={t("history.copyHash")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <a
          href={stellarExpertLink(record.hash, record.network)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("history.viewOnExplorer")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
