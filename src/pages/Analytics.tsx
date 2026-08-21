import { Helmet } from "react-helmet-async"
import { useTranslation } from "react-i18next"
import { BarChart3, Coins, Lock as LockIcon } from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from "recharts"
import { Card, CardHeader, CardTitle } from "@/components/ui/Card"
import { StatCard } from "@/components/ui/StatCard"
import { SkeletonStatCard } from "@/components/ui/Skeleton"
import { useAsync } from "@/hooks/useAsync"
import { MOCK_LOCKS } from "@/lib/mock-data"
import { getTvlOverTime, getLockVolumeByDay, getTokenDistribution, type DistributionSlice } from "@/lib/dashboardStats"
import { formatUsd } from "@/lib/utils"

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#a855f7"]

/**
 * Locks are sourced from MOCK_LOCKS pending the indexer HTTP API (see the
 * indexer follow-up); swapping to live data is a matter of replacing this
 * fetcher, since the chart mappings below are pure functions of Lock[].
 */
function useAllLocks() {
  return useAsync(() => Promise.resolve(MOCK_LOCKS), [])
}

export function Analytics() {
  const { t } = useTranslation()
  const { data: locks, loading } = useAllLocks()
  const activeLocks = (locks ?? []).filter((l) => l.status !== "withdrawn")

  const tvlSeries = getTvlOverTime(activeLocks)
  const volumeSeries = getLockVolumeByDay(activeLocks)
  const distribution = getTokenDistribution(activeLocks)
  const totalValueLocked = activeLocks.reduce((s, l) => s + (l.usdValue ?? 0), 0)
  const isEmpty = !loading && activeLocks.length === 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Helmet>
        <title>{t("analytics.title")} | StellarLock</title>
        <meta name="description" content={t("analytics.subtitle")} />
      </Helmet>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t("analytics.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("analytics.subtitle")}</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            <StatCard
              label={t("analytics.totalValueLocked")}
              value={formatUsd(totalValueLocked)}
              icon={<Coins className="h-4 w-4" />}
            />
            <StatCard
              label={t("analytics.totalLocks")}
              value={String(activeLocks.length)}
              icon={<LockIcon className="h-4 w-4" />}
            />
            <StatCard
              label={t("analytics.tokensTracked")}
              value={String(distribution.length)}
              icon={<BarChart3 className="h-4 w-4" />}
            />
          </>
        )}
      </div>

      {isEmpty ? (
        <Card className="p-10 text-center text-muted-foreground">{t("analytics.noData")}</Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("analytics.tvlOverTime")}</CardTitle>
            </CardHeader>
            <div className="h-64 px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tvlSeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v: number) => formatUsd(v)} width={70} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatUsd(Number(v))} />
                  <Area
                    type="monotone"
                    dataKey="tvl"
                    stroke={CHART_COLORS[0]}
                    fill={CHART_COLORS[0]}
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("analytics.lockVolume")}</CardTitle>
            </CardHeader>
            <div className="h-64 px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeSeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} width={30} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("analytics.tokenDistribution")}</CardTitle>
            </CardHeader>
            <div className="h-72 px-2 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distribution}
                    dataKey="value"
                    nameKey="symbol"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(props: PieLabelRenderProps) =>
                      (props.payload as DistributionSlice | undefined)?.symbol ?? ""
                    }
                  >
                    {distribution.map((slice, i) => (
                      <Cell key={slice.symbol} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatUsd(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
