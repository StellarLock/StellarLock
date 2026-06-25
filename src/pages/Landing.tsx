import { Link } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { Trans, useTranslation } from "react-i18next"
import { ShieldCheck, Lock, Eye, Droplets, Clock, Share2, ArrowRight, TrendingUp } from "lucide-react"
import { TokenSearchBar } from "@/components/explorer/TokenSearchBar"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Card } from "@/components/ui/Card"
import { formatUsd } from "@/lib/utils"
import { MOCK_LOCKS } from "@/lib/mock-data"

const totalSecured = MOCK_LOCKS.filter((l) => l.status !== "withdrawn").reduce((s, l) => s + l.usdValue, 0)

export function Landing() {
  const { t } = useTranslation()

  return (
    <div>
      <Helmet>
        <title>StellarLock — Token & LP Locks on Stellar</title>
        <meta
          name="description"
          content="Lock tokens and liquidity on Stellar. Prove to your community you haven't rugged with a public, verifiable lock explorer."
        />
      </Helmet>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-grid bg-grid-fade absolute inset-0 -z-10" aria-hidden />
        <div className="mx-auto max-w-4xl px-4 pb-16 pt-20 text-center">
          <Badge variant="primary" className="mb-6">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("landing.badge")}
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            <Trans i18nKey="landing.heroTitle">
              Prove your liquidity is <span className="text-primary">locked</span> — without asking for trust
            </Trans>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            {t("landing.heroDesc")}
          </p>

          <div className="mx-auto mt-8 max-w-2xl">
            <TokenSearchBar autoFocus />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link to="/app/create">
              <Button size="lg">
                {t("landing.lockTokens")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/app/locks">
              <Button size="lg" variant="outline">
                {t("landing.viewLocks")}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border bg-card/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 sm:grid-cols-4">
          <Stat label={t("landing.valueSecured")} value={formatUsd(totalSecured)} />
          <Stat
            label={t("landing.activeLocks")}
            value={String(MOCK_LOCKS.filter((l) => l.status !== "withdrawn").length)}
          />
          <Stat label={t("landing.supportedDexs")} value="2" hint={t("landing.dexHint")} />
          <Stat label={t("landing.network")} value={t("landing.networkValue")} hint={t("common.testnet")} />
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-bold tracking-tight">{t("landing.problemTitle")}</h2>
          <p className="mt-4 text-pretty text-muted-foreground">{t("landing.problemDesc")}</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          <Feature
            icon={<Lock className="h-5 w-5" />}
            title={t("landing.featureTokenTitle")}
            desc={t("landing.featureTokenDesc")}
          />
          <Feature
            icon={<Droplets className="h-5 w-5" />}
            title={t("landing.featureLpTitle")}
            desc={t("landing.featureLpDesc")}
          />
          <Feature
            icon={<Eye className="h-5 w-5" />}
            title={t("landing.featureExplorerTitle")}
            desc={t("landing.featureExplorerDesc")}
          />
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">{t("landing.howItWorks")}</h2>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Step
              n={1}
              icon={<Lock className="h-5 w-5" />}
              title={t("landing.stepLockTitle")}
              desc={t("landing.stepLockDesc")}
            />
            <Step
              n={2}
              icon={<Clock className="h-5 w-5" />}
              title={t("landing.stepEnforceTitle")}
              desc={t("landing.stepEnforceDesc")}
            />
            <Step
              n={3}
              icon={<Share2 className="h-5 w-5" />}
              title={t("landing.stepShareTitle")}
              desc={t("landing.stepShareDesc")}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Card className="flex flex-col items-center gap-6 overflow-hidden border-primary/30 bg-primary/5 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <TrendingUp className="h-6 w-6" />
          </span>
          <h2 className="max-w-xl text-balance text-3xl font-bold tracking-tight">{t("landing.ctaTitle")}</h2>
          <p className="max-w-xl text-pretty text-muted-foreground">{t("landing.ctaDesc")}</p>
          <Link to="/app/create">
            <Button size="lg">
              {t("landing.ctaButton")} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </Card>
      </section>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-background px-4 py-8 text-center">
      <p className="text-3xl font-bold tabular-nums text-primary">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary">{icon}</span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </Card>
  )
}

function Step({ n, icon, title, desc }: { n: number; icon: React.ReactNode; title: string; desc: string }) {
  const { t } = useTranslation()

  return (
    <div className="relative flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          {icon}
        </span>
        <span className="font-mono text-sm text-muted-foreground">{t("landing.step", { n })}</span>
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  )
}
