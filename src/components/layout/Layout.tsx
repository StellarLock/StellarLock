import { Link, Outlet } from "react-router-dom"
import { Lock } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Navbar } from "@/components/layout/Navbar"
import { WalletAlerts } from "@/components/layout/WalletAlerts"
import { NETWORK } from "@/lib/stellar"
import { Breadcrumbs } from "@/components/layout/Breadcrumbs"

export function Layout() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
      >
        {t("common.skipToContent")}
      </a>
      <WalletAlerts />
      <Navbar />
      <Breadcrumbs />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Lock className="h-3 w-3" />
          </span>
          <span className="font-medium text-foreground">{t("common.appName")}</span>
          <span>— {t("common.tagline")}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/app/create" className="hover:text-foreground">
            {t("nav.createLock")}
          </Link>
          <Link to="/app/locks" className="hover:text-foreground">
            {t("nav.myLocks")}
          </Link>
          <span className="rounded-md border border-border px-2 py-0.5 text-xs">
            {t(`common.${NETWORK.id}`)}
          </span>
        </div>
      </div>
    </footer>
  )
}
