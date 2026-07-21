import { useEffect, useMemo, useState } from "react"
import { Activity, CheckCircle2, AlertCircle, WifiOff } from "lucide-react"
import { NETWORK } from "@/lib/stellar"

interface HealthStatus {
  name: string
  status: "ok" | "degraded" | "down"
  detail: string
}

const HEALTH_TIMEOUT_MS = 5000

export function HealthPage() {
  const [statuses, setStatuses] = useState<HealthStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function checkStatus() {
      setLoading(true)
      setError(null)
      const checks: Array<Promise<HealthStatus>> = [
        checkUrl("Soroban RPC", NETWORK.rpcUrl, "/health"),
        checkUrl("Horizon API", NETWORK.horizonUrl, "/"),
        checkBrowserExtension(),
      ]

      try {
        const results = await Promise.all(checks)
        if (active) {
          setStatuses(results)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Health check failed")
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void checkStatus()
    return () => {
      active = false
    }
  }, [])

  const overall = useMemo(() => {
    if (statuses.length === 0) return "checking"
    if (statuses.every((item) => item.status === "ok")) return "ok"
    if (statuses.some((item) => item.status === "down")) return "down"
    return "degraded"
  }, [statuses])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Monitoring</p>
            <h1 className="text-2xl font-semibold">System health</h1>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${overall === "ok" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : overall === "down" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
            {overall === "ok" ? "Healthy" : overall === "down" ? "Unhealthy" : "Checking"}
          </span>
          <span className="text-sm text-muted-foreground">Environment: {import.meta.env.MODE}</span>
          <span className="text-sm text-muted-foreground">Network: {NETWORK.displayName}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {loading && !statuses.length ? (
          <div className="col-span-full rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Checking dependencies…</div>
        ) : (
          statuses.map((item) => (
            <div key={item.name} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                </div>
                {item.status === "ok" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : item.status === "degraded" ? (
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                ) : (
                  <WifiOff className="h-5 w-5 text-rose-500" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

async function checkUrl(name: string, baseUrl: string, path: string): Promise<HealthStatus> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)

  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal, headers: { Accept: "application/json" } })
    window.clearTimeout(timeout)
    return {
      name,
      status: response.ok ? "ok" : "degraded",
      detail: `${response.status} ${response.statusText}`,
    }
  } catch {
    window.clearTimeout(timeout)
    return {
      name,
      status: "down",
      detail: "Unreachable",
    }
  }
}

function checkBrowserExtension(): Promise<HealthStatus> {
  const hasFreighter = typeof window !== "undefined" && Boolean((window as Window & { freighter?: unknown }).freighter)
  return Promise.resolve({
    name: "Freighter extension",
    status: hasFreighter ? "ok" : "degraded",
    detail: hasFreighter ? "Extension available" : "Not detected in browser",
  })
}
