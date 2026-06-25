import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { useTranslation } from "react-i18next"
import { Lock, Coins, ShieldCheck, CalendarClock, ArrowRight } from "lucide-react"
import { TokenSearchBar } from "@/components/explorer/TokenSearchBar"
import { Card } from "@/components/ui/Card"
import { StatCard } from "@/components/ui/StatCard"
import { Badge } from "@/components/ui/Badge"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { TokenAvatar } from "@/components/ui/TokenAvatar"
import { Button } from "@/components/ui/Button"
import { RecentActivity } from "@/components/discover/RecentActivity"
import { MOCK_LOCKS, TOKENS } from "@/lib/mock-data"
import { formatAmount, formatDate, formatUsd, shortAddress } from "@/lib/utils"

const activeLocks = MOCK_LOCKS.filter((l) => l.status !== "withdrawn")
const totalValueLocked = activeLocks.reduce((s, l) => s + l.usdValue, 0)
const uniqueTokens = new Set(activeLocks.map((l) => l.token.address)).size

const recentLocks = [...MOCK_LOCKS].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)

const upcomingUnlocks = activeLocks
  .filter((l) => l.status === "locked")
  .sort((a, b) => a.unlockAt - b.unlockAt)
  .slice(0, 5)

const tokenGroups = Object.values(
  activeLocks.reduce<Record<string, { token: (typeof activeLocks)[0]["token"]; count: number; totalValue: number }>>(
    (acc, lock) => {
      const key = lock.token.address
      if (!acc[key]) acc[key] = { token: lock.token, count: 0, totalValue: 0 }
      acc[key].count++
      acc[key].totalValue += lock.usdValue
      return acc
    },
    {},
  ),
).sort((a, b) => b.totalValue - a.totalValue)

export function Discover() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Helmet>
        <title>Explore Locks | StellarLock</title>
        <meta
          name="description"
          content="Browse all token and LP locks on StellarLock. Discover recently created locks, upcoming unlocks, and secured tokens."
        />
      </Helmet>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t("discover.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("discover.subtitle")}</p>
      </div>

      <div className="mb-8">
        <TokenSearchBar />
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={t("discover.totalLocks")}
          value={String(activeLocks.length)}
          hint={t("explorer.enforced")}
          icon={<Lock className="h-4 w-4" />}
        />
        <StatCard
          label={t("discover.totalValueLocked")}
          value={formatUsd(totalValueLocked)}
          hint={t("explorer.approxUsd")}
          icon={<Coins className="h-4 w-4" />}
        />
        <StatCard
          label={t("discover.tokensSecured")}
          value={String(uniqueTokens)}
          hint={t("explorer.enforced")}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent Locks */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">{t("discover.recentLocks")}</h2>
          <Card className="divide-y divide-border">
            {recentLocks.map((lock) => (
              <Link
                key={lock.id}
                to={`/app/lock/${lock.id}`}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-secondary/30"
              >
                <TokenAvatar symbol={lock.token.symbol} contractId={lock.token.address} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{lock.token.symbol}</span>
                    <Badge variant="outline" className="text-[10px]">
                      #{lock.id}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatAmount(lock.amount)} · {formatDate(lock.createdAt)}
                  </p>
                </div>
                <StatusBadge status={lock.status} />
              </Link>
            ))}
          </Card>
        </section>

        {/* Upcoming Unlocks */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">{t("discover.upcomingUnlocks")}</h2>
          <Card className="divide-y divide-border">
            {upcomingUnlocks.map((lock) => (
              <Link
                key={lock.id}
                to={`/app/lock/${lock.id}`}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-secondary/30"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{lock.token.symbol}</span>
                    <Badge variant="outline" className="text-[10px]">
                      #{lock.id}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatAmount(lock.amount)} · unlocks {formatDate(lock.unlockAt)}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(lock.unlockAt)}</span>
              </Link>
            ))}
          </Card>
        </section>
      </div>

      {/* Featured Tokens */}
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">{t("discover.featuredTokens")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tokenGroups.map((group) => (
            <Link key={group.token.address} to={`/explore/${group.token.address}`}>
              <Card className="p-5 transition-colors hover:border-primary/40">
                <div className="flex items-center gap-3">
                  <TokenAvatar symbol={group.token.symbol} contractId={group.token.address} size="md" />
                  <div>
                    <p className="font-semibold">{group.token.symbol}</p>
                    <p className="text-xs text-muted-foreground">{group.token.name}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {group.count} lock{group.count === 1 ? "" : "s"}
                  </span>
                  <span className="font-medium text-success">{formatUsd(group.totalValue)}</span>
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                  View locks <ArrowRight className="h-3 w-3" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent Activity */}
      <RecentActivity />
    </div>
  )
}
