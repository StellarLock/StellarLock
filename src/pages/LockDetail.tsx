import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Lock as LockIcon, Repeat, ExternalLink, ShieldCheck, Globe } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLock } from "@/hooks/useLocks"
import { useWallet } from "@/hooks/useWallet"
import { withdrawLock, extendLock } from "@/lib/token-locker"
import { withdrawLpLock, extendLpLock } from "@/lib/lp-locker"
import { trackEvent } from "@/lib/analytics"
import { addTransaction } from "@/lib/transaction-history"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/Badge"
import { TokenAvatar } from "@/components/ui/TokenAvatar"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { DexBadge } from "@/components/ui/DexBadge"
import { CountdownTimer } from "@/components/ui/CountdownTimer"
import { LockProgressBar } from "@/components/ui/LockProgressBar"
import {
  formatAmount,
  formatUsd,
  formatDateTime,
  shortAddress,
} from "@/lib/utils"
import type { Lock } from "@/types/lock"

export function LockDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { data: lock, loading, error, reload } = useLock(id)

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <div className="h-8 w-32 animate-pulse rounded bg-card" />
        <div className="mt-6 h-96 animate-pulse rounded-xl border border-border bg-card/50" />
      </div>
    )
  }

  if (error || !lock) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
        <h1 className="text-2xl font-bold">{t("lockDetail.notFoundTitle")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("lockDetail.notFoundDesc", { id })}
        </p>
        <Link to="/app/locks">
          <Button variant="outline" className="mt-6">
            <ArrowLeft className="h-4 w-4" />
            {t("lockDetail.backToLocks")}
          </Button>
        </Link>
      </div>
    )
  }

  return <LockDetailView lock={lock} onChange={reload} />
}

function LockDetailView({ lock, onChange }: { lock: Lock; onChange: () => void }) {
  const { t } = useTranslation()
  const { address, signTransaction } = useWallet()
  const navigate = useNavigate()
  const isLp = lock.kind === "lp"

  const now = Date.now()
  const isBeneficiary = address === lock.beneficiary
  const isCreator = address === lock.creator
  const canWithdraw = isBeneficiary && lock.unlockAt <= now && lock.status !== "withdrawn"
  const canExtend = isCreator && lock.status !== "withdrawn"

  const [busy, setBusy] = useState<"withdraw" | "extend" | null>(null)
  const [extendOpen, setExtendOpen] = useState(false)
  const [newDate, setNewDate] = useState("")
  const extendPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (extendOpen) {
      const input = extendPanelRef.current?.querySelector("input")
      input?.focus()
    }
  }, [extendOpen])

  async function handleWithdraw() {
    setBusy("withdraw")
    try {
      const { hash } = await (isLp
        ? withdrawLpLock(lock.id, address!, signTransaction)
        : withdrawLock(lock.id, address!, signTransaction))
      addTransaction({
        hash,
        action: "withdraw",
        kind: lock.kind,
        address: address!,
        lockId: lock.id,
        token: lock.token.address,
        tokenSymbol: lock.token.symbol,
        amount: lock.amount,
      })
      trackEvent("lock_withdraw", { kind: lock.kind })
      onChange()
    } finally {
      setBusy(null)
    }
  }

  async function handleExtend() {
    if (!newDate) return
    const ts = Math.floor(new Date(newDate).getTime() / 1000)
    if (ts <= Math.floor(lock.unlockAt / 1000)) return
    setBusy("extend")
    try {
      const { hash } = await (isLp
        ? extendLpLock(lock.id, ts, address!, signTransaction)
        : extendLock(lock.id, ts, address!, signTransaction))
      addTransaction({
        hash,
        action: "extend",
        kind: lock.kind,
        address: address!,
        lockId: lock.id,
        token: lock.token.address,
        tokenSymbol: lock.token.symbol,
        amount: lock.amount,
      })
      trackEvent("lock_extend", { kind: lock.kind })
      setExtendOpen(false)
      onChange()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("common.back")}
      </button>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <TokenAvatar symbol={lock.token.symbol} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{lock.token.symbol}</h1>
                {isLp && lock.dex && <DexBadge dex={lock.dex} />}
                <Badge variant="outline">{isLp ? t("lockDetail.lpLock") : t("lockDetail.tokenLock")}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{lock.token.name}</p>
            </div>
          </div>
          <StatusBadge status={lock.status} />
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-2">
          <Field label={t("lockDetail.lockedAmount")} className="bg-card">
            <span className="text-lg font-semibold tabular-nums">
              {formatAmount(lock.amount)} {lock.token.symbol}
            </span>
            <span className="ml-2 text-sm text-muted-foreground">{formatUsd(lock.usdValue)}</span>
          </Field>
          <Field label={t("lockDetail.lockId")} className="bg-card">
            <span className="font-mono">#{lock.id}</span>
            {lock.extendedCount > 0 && (
              <span className="ml-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="h-3 w-3" />
                {t("lockDetail.extended", { count: lock.extendedCount })}
              </span>
            )}
          </Field>
          <Field label={t("lockDetail.lockedOn")} className="bg-card">
            {formatDateTime(lock.createdAt)}
          </Field>
          <Field label={t("lockDetail.unlocksOn")} className="bg-card">
            {formatDateTime(lock.unlockAt)}
          </Field>
          <Field label={t("lockDetail.creator")} className="bg-card">
            <span className="font-mono">{shortAddress(lock.creator)}</span>
            {isCreator && <Badge className="ml-2">{t("common.you")}</Badge>}
          </Field>
          <Field label={t("lockDetail.beneficiary")} className="bg-card">
            <span className="font-mono">{shortAddress(lock.beneficiary)}</span>
            {isBeneficiary && <Badge className="ml-2">{t("common.you")}</Badge>}
          </Field>
        </div>

        <div className="border-t border-border p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{t("lockDetail.timeRemaining")}</span>
            <CountdownTimer target={lock.unlockAt} compact className="text-sm font-medium" />
          </div>
          <CountdownTimer target={lock.unlockAt} className="mb-5 justify-center sm:justify-start" />
          <LockProgressBar createdAt={lock.createdAt} unlockAt={lock.unlockAt} />
        </div>


        {/* Vesting schedule */}
        {lock.vesting && (
          <div className="border-t border-border p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Vesting Schedule</h3>
              <Badge variant="outline">Linear</Badge>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">Vesting start</p>
                <p className="font-medium">{formatDateTime(lock.vesting.start)}</p>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">Vesting end</p>
                <p className="font-medium">{formatDateTime(lock.vesting.end)}</p>
              </div>
            </div>
            <div className="mb-3">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium tabular-nums">{Math.min(100, Math.max(0, Math.round(((now - lock.vesting.start) / (lock.vesting.end - lock.vesting.start)) * 100)))}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all" style={{ width: `${Math.min(100, Math.max(0, ((now - lock.vesting.start) / (lock.vesting.end - lock.vesting.start)) * 100))}%` }} />
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-semibold tabular-nums">{formatAmount(lock.amount)} {lock.token.symbol}</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">Released</p>
                <p className="font-semibold tabular-nums text-success">{formatAmount(lock.vesting.released)} {lock.token.symbol}</p>
              </div>
              <div className="rounded-lg bg-secondary/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">Claimable</p>
                <p className="font-semibold tabular-nums text-primary">{formatAmount(Math.max(0, (lock.amount * Math.min(now, lock.vesting.end) - lock.vesting.start) / Math.max(1, lock.vesting.end - lock.vesting.start)))} {lock.token.symbol}</p>
              </div>
            </div>
          </div>
        )}

        {/* Project metadata */}
        {lock.metadata && (
          <div className="border-t border-border p-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("lockDetail.aboutProject")}
            </h3>
            {lock.metadata.description && (
              <p className="text-sm text-foreground">{lock.metadata.description}</p>
            )}
            {lock.metadata.projectUrl && (
              <a
                href={lock.metadata.projectUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Globe className="h-3.5 w-3.5" />
                {t("lockDetail.visitWebsite")}
              </a>
            )}
          </div>
        )}

        {(canWithdraw || canExtend) && (
          <div className="flex flex-col gap-3 border-t border-border p-6 sm:flex-row">
            {canWithdraw && (
              <Button onClick={handleWithdraw} loading={busy === "withdraw"} className="flex-1">
                <LockIcon className="h-4 w-4" />
                {t("lockDetail.withdraw")}
              </Button>
            )}
            {canExtend && (
              <Button
                variant={canWithdraw ? "outline" : "primary"}
                onClick={() => setExtendOpen((v) => !v)}
                aria-expanded={extendOpen}
                className="flex-1"
              >
                <Repeat className="h-4 w-4" />
                {t("lockDetail.extendLock")}
              </Button>
            )}
          </div>
        )}

        {extendOpen && canExtend && (
          <div ref={extendPanelRef} role="region" aria-label={t("lockDetail.extendLock")} className="border-t border-border bg-secondary/30 p-6">
            <label className="text-sm font-medium" htmlFor="new-unlock">
              {t("lockDetail.newUnlockDate")}
            </label>
            <p className="mb-3 text-xs text-muted-foreground">
              {t("lockDetail.extendHint")}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="new-unlock"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleExtend} loading={busy === "extend"} disabled={!newDate}>
                {t("lockDetail.confirmExtension")}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {lock.status === "locked" && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <p>
            {t("lockDetail.securityNotice")}{" "}
            <Link
              to={`/explore/${lock.token.address}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {t("lockDetail.viewExplorer")} <ExternalLink className="h-3 w-3" />
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-1.5 flex items-center">{children}</div>
      </div>
    </div>
  )
}
