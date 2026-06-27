import { useLocation, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Breadcrumb } from "@/components/ui/Breadcrumb"

export function Breadcrumbs() {
  const { t } = useTranslation()
  const location = useLocation()
  const params = useParams()
  const path = location.pathname

  // No breadcrumbs on home or top-level routes
  if (path === "/" || path === "/explore" || path === "/app/locks" || path === "/app/create") {
    return null
  }

  let items: { label: string; to?: string }[] = []

  if (path.startsWith("/app/lock/")) {
    // /app/lock/:id → Home > My Locks > Lock #:id
    items = [
      { label: t("breadcrumbs.home"), to: "/" },
      { label: t("breadcrumbs.myLocks"), to: "/app/locks" },
      { label: t("breadcrumbs.lockId", { id: params.id ?? "" }) },
    ]
  } else if (path.startsWith("/explore/")) {
    // /explore/:token → Home > Discover > :token (shortened)
    const token = params.token ?? ""
    const shortToken = token.length > 12 ? `${token.slice(0, 6)}…${token.slice(-4)}` : token
    items = [
      { label: t("breadcrumbs.home"), to: "/" },
      { label: t("breadcrumbs.discover"), to: "/explore" },
      { label: shortToken },
    ]
  }

  if (items.length === 0) return null

  return (
    <div className="border-b border-border bg-background/60 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-2">
        <Breadcrumb items={items} />
      </div>
    </div>
  )
}
