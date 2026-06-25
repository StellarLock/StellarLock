import { useState, useEffect } from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { Lock, Wallet, LogOut, Menu, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWallet } from "@/hooks/useWallet"
import { Button } from "@/components/ui/Button"
import { NotificationCenter } from "@/components/ui/NotificationCenter"
import { shortAddress, cn } from "@/lib/utils"

export function Navbar() {
  const { t } = useTranslation()
  const { address, isConnected, connecting, connect, disconnect } = useWallet()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const navLinks = [
    { to: "/explore", label: t("nav.explore") },
    { to: "/app/create", label: t("nav.createLock") },
    { to: "/app/locks", label: t("nav.myLocks") },
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
            <>
              <NotificationCenter />
              <span className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium sm:flex">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                <span className="font-mono">{shortAddress(address!)}</span>
              </span>
              <Button variant="ghost" size="icon" onClick={disconnect} aria-label={t("nav.disconnectWallet")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button onClick={connect} loading={connecting} className="hidden sm:inline-flex">
              <Wallet className="h-4 w-4" />
              {t("nav.connectWallet")}
            </Button>
          )}

          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-secondary md:hidden"
            aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div id="mobile-nav" className="border-t border-border bg-background md:hidden">
          <nav
            aria-label="Mobile navigation"
            className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3"
          >
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-3 text-sm font-medium transition-colors",
                    isActive || location.pathname.startsWith(link.to)
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}

            <div className="mt-2 border-t border-border pt-3">
              {isConnected ? (
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
                  <span className="font-mono text-sm text-muted-foreground">{shortAddress(address!)}</span>
                  <button
                    onClick={() => { disconnect(); setMenuOpen(false) }}
                    className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    aria-label={t("nav.disconnectWallet")}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button onClick={() => { connect(); setMenuOpen(false) }} loading={connecting} className="w-full">
                  <Wallet className="h-4 w-4" />
                  {t("nav.connectWallet")}
                </Button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
