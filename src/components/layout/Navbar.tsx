import { Link, NavLink, useLocation } from "react-router-dom"
import { Lock, Wallet, LogOut } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWallet } from "@/hooks/useWallet"
import { Button } from "@/components/ui/Button"
import { shortAddress, cn } from "@/lib/utils"

export function Navbar() {
  const { t } = useTranslation()
  const { address, isConnected, connecting, connect, disconnect } = useWallet()
  const location = useLocation()

  const navLinks = [
    { to: "/app/create", label: t("nav.createLock") },
    { to: "/app/locks", label: t("nav.myLocks") },
    { to: "/app/history", label: t("nav.history") },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Lock className="h-4 w-4" />
          </span>
          <span className="text-lg font-bold tracking-tight">
            Stellar<span className="text-primary">Lock</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive || location.pathname.startsWith(link.to)
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium sm:flex">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                <span className="font-mono">{shortAddress(address!)}</span>
              </span>
              <Button variant="ghost" size="icon" onClick={disconnect} aria-label={t("nav.disconnectWallet")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button onClick={connect} loading={connecting}>
              <Wallet className="h-4 w-4" />
              {t("nav.connectWallet")}
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
