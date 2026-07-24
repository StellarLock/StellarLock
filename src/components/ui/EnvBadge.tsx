import { ENV } from "@/lib/env"

/** Shown only in dev and staging builds — invisible in production. */
export function EnvBadge() {
  if (!ENV.showEnvBadge) return null

  const label = ENV.isDev ? "dev" : ENV.network
  const styles =
    label === "dev"
      ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
      : "bg-amber-500/20 text-amber-400 border-amber-500/30"

  return (
    <span
      className={`hidden rounded border px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider sm:inline-flex ${styles}`}
      aria-label={`Environment: ${label}`}
    >
      {label}
    </span>
  )
}
