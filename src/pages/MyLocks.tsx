import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Plus, Wallet, Layers, Search } from "lucide-react"
import { Helmet } from "react-helmet-async"
import { useTranslation } from "react-i18next"
import { useWallet } from "@/hooks/useWallet"
import { useMyLocks } from "@/hooks/useLocks"
import { Tabs } from "@/components/ui/Tabs"
import { Button } from "@/components/ui/Button"
import { StatCard } from "@/components/ui/StatCard"
import { LockCard } from "@/components/locks/LockCard"
import { ConnectGate } from "@/components/layout/ConnectGate"
import { formatUsd } from "@/lib/utils"
import type { Lock, LockStatus } from "@/types/lock"

type Tab = "created" | "received"
type SortKey = "unlockAt" | "amount" | "createdAt"

export function MyLocks() {
  const { t } = useTranslation()
  const { address } = useWallet()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useMyLocks(address)
  const [tab, setTab] = useState<Tab>("created")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<LockStatus | "all">("all")
  const [kindFilter, setKindFilter] = useState<"all" | "token" | "lp">("all")
  const [sortKey, setSortKey] = useState<SortKey>("unlockAt")

  const created = data?.created ?? []
  const received = data?.received ?? []

  const stats = useMemo(() => {
    const now = Date.now()
    const totalValue = created.reduce((sum, l) => sum + l.usdValue, 0)
    const unlockable = created.filter((l) => l.unlockAt <= now && l.status !== "withdrawn").length
    return { count: created.length, totalValue, unlockable }
  }, [created])

  const rawList = tab === "created" ? created : received

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rawList
      .filter((l) => {
        if (statusFilter !== "all" && l.status !== statusFilter) return false
        if (kindFilter !== "all" && l.kind !== kindFilter) return false
        if (q && !l.token.symbol.toLowerCase().includes(q) && !l.id.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        if (sortKey === "amount") return b.amount - a.amount
        if (sortKey === "createdAt") return b.createdAt - a.createdAt
        return a.unlockAt - b.unlockAt
      })
  }, [rawList, search, statusFilter, kindFilter, sortKey])

  return (
    <ConnectGate title={t("connectGate.title")}>
      <Helmet>
        <title>My Locks | StellarLock</title>
        <meta name="description" content="Manage and withdraw your locked token and LP positions on StellarLock." />
      </Helmet>
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">{t("myLocks.title")}</h1>
            <p className="mt-2 text-muted-foreground">{t("myLocks.subtitle")}</p>
          </div>
          <Button onClick={() => navigate("/app/create")}>
            <Plus className="h-4 w-4" />
            {t("myLocks.newLock")}
          </Button>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard label={t("myLocks.locksCreated")} value={String(stats.count)} icon={<Layers className="h-4 w-4" />} />
          <StatCard label={t("myLocks.totalValueLocked")} value={formatUsd(stats.totalValue)} />
          <StatCard
            label={t("myLocks.readyToWithdraw")}
            value={String(stats.unlockable)}
            hint={stats.unlockable > 0 ? t("myLocks.actionAvailable") : t("myLocks.nothingUnlocked")}
          />
        </div>

        <div className="mt-8">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            items={[
              { value: "created", label: t("myLocks.createdByMe"), count: created.length },
              { value: "received", label: t("myLocks.beneficiary"), count: received.length },
            ]}
          />
        </div>

        {/* Search + filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by token symbol or lock ID…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LockStatus | "all")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="locked">Locked</option>
            <option value="unlockable">Unlockable</option>
            <option value="withdrawn">Withdrawn</option>
          </select>

          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as "all" | "token" | "lp")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            <option value="token">Token</option>
            <option value="lp">LP</option>
          </select>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            aria-label="Sort locks"
          >
            <option value="unlockAt">Sort: Unlock date</option>
            <option value="amount">Sort: Amount</option>
            <option value="createdAt">Sort: Created</option>
          </select>
        </div>

        <LockGrid locks={filteredList} loading={loading} error={error} onRetry={reload} tab={tab} hasFilters={search !== "" || statusFilter !== "all" || kindFilter !== "all"} />
      </div>
    </ConnectGate>
  )
}

function LockGrid({
  locks,
  loading,
  error,
  onRetry,
  tab,
  hasFilters,
}: {
  locks: Lock[]
  loading: boolean
  error: string | null
  onRetry: () => void
  tab: Tab
  hasFilters: boolean
}) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-52 animate-pulse rounded-xl border border-border bg-card/50" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-10 rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t("myLocks.failedToLoad")}</p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          {t("common.tryAgain")}
        </Button>
      </div>
    )
  }

  if (locks.length === 0) {
    return (
      <div className="mt-10 rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Wallet className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-lg font-semibold">
          {hasFilters ? "No locks match your filters" : tab === "created" ? t("myLocks.noLocksCreated") : t("myLocks.noBeneficiary")}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {hasFilters
            ? "Try adjusting your search or filters."
            : tab === "created"
            ? t("myLocks.noLocksCreatedDesc")
            : t("myLocks.noBeneficiaryDesc")}
        </p>
        {!hasFilters && tab === "created" && (
          <Link to="/app/create">
            <Button className="mt-6">
              <Plus className="h-4 w-4" />
              {t("myLocks.createLock")}
            </Button>
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {locks.map((lock) => (
        <LockCard key={lock.id} lock={lock} />
      ))}
    </div>
  )
}
