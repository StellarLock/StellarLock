import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { Lock, Coins, CalendarClock, PieChart, ShieldCheck, ArrowLeft, ExternalLink, SearchX } from "lucide-react"
import { Helmet } from "react-helmet-async"
import { Trans, useTranslation } from "react-i18next"
import { useLocksByToken, useLockCountByToken } from "@/hooks/useLocks"
import { TokenAvatar } from "@/components/ui/TokenAvatar"
import { StatCard } from "@/components/ui/StatCard"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Pagination } from "@/components/ui/Pagination"
import { TokenLockList } from "@/components/explorer/TokenLockList"
import { LockBadge } from "@/components/explorer/LockBadge"
import { TokenSearchBar } from "@/components/explorer/TokenSearchBar"
import { SkeletonTokenHeader, SkeletonLockCard, SkeletonStatCard } from "@/components/ui/Skeleton"
import { explorerLink } from "@/lib/stellar"
import { formatAmount, formatDate, formatUsd, shortAddress } from "@/lib/utils"
import { CopyButton } from "@/components/ui/CopyButton"

const PAGE_SIZE = 20

export function Explorer() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const [page, setPage] = useState(1)
  const { data, loading, error } = useLocksByToken(token, (page - 1) * PAGE_SIZE, PAGE_SIZE)
  const { data: totalCount } = useLockCountByToken(token)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {data && (
        <Helmet>
          <title>{data.token.symbol} Liquidity Locks | StellarLock</title>
          <meta
            name="description"
            content={`${formatAmount(data.totalLocked)} ${data.token.symbol} locked across ${data.activeLocks} active locks on StellarLock.`}
          />
        </Helmet>
      )}
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("explorer.backToSearch")}
      </Link>

      {loading && <ExplorerSkeleton />}

      {!loading && (error || !data) && <NotFound query={token ?? ""} />}

      {!loading && data && (
        <div className="flex flex-col gap-8">
          {/* Header */}
          <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <TokenAvatar symbol={data.token.symbol} contractId={data.token.address} size="lg" showVerified />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{data.token.name}</h1>
                  <Badge variant="primary">{data.token.symbol}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={explorerLink(data.token.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {shortAddress(data.token.address, 8, 8)}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <CopyButton text={data.token.address} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3">
              <ShieldCheck className="h-5 w-5 text-success" />
              <div className="leading-tight">
                <p className="text-sm font-semibold text-success">{t("explorer.verifiedLocked")}</p>
                <p className="text-xs text-muted-foreground">{t("explorer.verifiedHint")}</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("explorer.totalLocked")}
              value={formatAmount(data.totalLocked, { compact: true })}
              hint={t("explorer.acrossAllLocks", { symbol: data.token.symbol })}
              icon={<Coins className="h-4 w-4" />}
            />
            <StatCard
              label={t("explorer.valueSecured")}
              value={formatUsd(data.totalUsdValue)}
              hint={t("explorer.approxUsd")}
              icon={<Lock className="h-4 w-4" />}
            />
            <StatCard
              label={t("explorer.activeLocks")}
              value={data.activeLocks}
              hint={t("explorer.enforced")}
              icon={<ShieldCheck className="h-4 w-4" />}
            />
            <StatCard
              label={t("explorer.nextUnlock")}
              value={data.nextUnlockAt ? formatDate(data.nextUnlockAt) : "—"}
              hint={data.percentOfSupply ? t("explorer.supplyLocked", { percent: data.percentOfSupply }) : undefined}
              icon={data.percentOfSupply ? <PieChart className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
            />
          </div>

          {/* Shareable badge */}
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">{t("explorer.shareTitle")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("explorer.shareDesc")}</p>
            <div className="mt-5">
              <LockBadge summary={data} />
            </div>
          </section>

          {/* Locks list */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {t("explorer.allLocks", { count: totalCount ?? data.locks.length })}
              </h2>
            </div>
            <TokenLockList locks={data.locks} />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={totalCount ?? 0}
              onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }) }}
            />
          </section>
        </div>
      )}
    </div>
  )
}

function ExplorerSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <SkeletonTokenHeader />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonLockCard key={i} />
        ))}
      </div>
    </div>
  )
}

function NotFound({ query }: { query: string }) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card">
        <SearchX className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold">{t("explorer.noLocksTitle")}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        <Trans i18nKey="explorer.noLocksDesc" values={{ query: shortAddress(query, 6, 6) }}>
          We couldn&apos;t find any locks for{" "}
          <span className="font-mono text-foreground">{{ query: shortAddress(query, 6, 6) } as unknown as string}</span>
          .
        </Trans>
      </p>
      <div className="mt-6">
        <TokenSearchBar />
      </div>
      <div className="mt-4">
        <Link to="/app/create">
          <Button variant="outline">{t("explorer.createLock")}</Button>
        </Link>
      </div>
    </div>
  )
}
