import { useEffect, useMemo, useRef, useState } from "react"
import { Activity, Lock, LogOut, GitBranch, UserCheck, Pause, Play, Copy } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Card } from "@/components/ui/Card"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/Badge"
import { useContractEventContext, type ContractEvent } from "@/hooks/useContractEventContext"
import { CopyableAddress } from "@/components/discover/CopyableAddress"
import { formatDate, shortAddress } from "@/lib/utils"

const MAX_ITEMS = 50
const DEFAULT_POLL_INTERVAL_MS = 3000

type LockKind = "token" | "lp"

type ActivityType =
  | "lock_created"
  | "lock_withdrawn"
  | "lock_extended"
  | "beneficiary_transferred"
  | "lp_lock_created"
  | "lp_lock_withdrawn"
  | "lp_lock_extended"
  | "lp_beneficiary_transferred"

interface FeedItem {
  id: string
  type: ActivityType
  kind: LockKind
  lockId: string
  timestamp: number
  title: string
  detail: React.ReactNode
}

function safeString(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v
  return null
}

function toLockKind(type: ActivityType): LockKind {
  return type.startsWith("lp_") ? "lp" : "token"
}

function itemHref(item: FeedItem) {
  return `/app/lock/${item.kind}/${item.lockId}`
}

function formatUnlockDate(tsMaybe: unknown): number | null {
  if (typeof tsMaybe === "number") return tsMaybe
  if (typeof tsMaybe === "string") {
    const n = Number(tsMaybe)
    if (Number.isFinite(n)) return n
  }
  return null
}

function eventToFeedItem(event: ContractEvent): FeedItem | null {
  const type = event.type as ActivityType
  const kind = toLockKind(type)

  const raw = event.data?.raw as any

  // Best-effort extraction from Soroban getEvents payload.
  // Contract ABI/topic mapping may change; we fall back gracefully.
  const creator = safeString(raw?.creator) || safeString(raw?.from) || safeString(raw?.address)
  const beneficiary = safeString(raw?.beneficiary) || safeString(raw?.to)
  const token = safeString(raw?.token) || safeString(raw?.asset)
  const amount = raw?.amount ?? raw?.value
  const unlockAtMaybe = raw?.unlockAt ?? raw?.newUnlockAt ?? raw?.unlock_timestamp

  const timestamp = event.timestamp
  const lockId = event.lockId

  const base: Omit<FeedItem, "title" | "detail"> = {
    id: `${lockId}-${type}-${event.timestamp}`,
    type,
    kind,
    lockId,
    timestamp,
  }

  switch (type) {
    case "lock_created": {
      const lockedUntil = formatUnlockDate(unlockAtMaybe)
      const creatorName = creator ? shortAddress(creator) : "Unknown"
      const tokenSymbolOrAddr = token ? shortAddress(token) : "Token"
      const unlockDateLabel = lockedUntil ? formatDate(lockedUntil) : "(unknown)"

      return {
        ...base,
        title: "New lock created",
        detail: (
          <>
            <span>{creatorName} </span>
            <span>locked</span>
            <span className="font-medium"> {amount ? String(amount) : "…"} </span>
            <span>{tokenSymbolOrAddr}</span>
            <span> until </span>
            <span className="font-medium">{unlockDateLabel}</span>
          </>
        ),
      }
    }
    case "lock_withdrawn":
      return {
        ...base,
        title: "Lock withdrawn",
        detail: (
          <>
            <span>{beneficiary ? shortAddress(beneficiary) : "Unknown"} </span>
            <span>withdrew</span>
            <span className="font-medium"> {amount ? String(amount) : "…"} </span>
            <span>{token ? shortAddress(token) : "Token"}</span>
            <span> from lock </span>
            <Link to={`/app/lock/${kind}/${lockId}`} className="font-mono text-primary hover:underline">
              #{lockId}
            </Link>
          </>
        ),
      }
    case "lock_extended": {
      const newUnlockTs = formatUnlockDate(unlockAtMaybe)
      return {
        ...base,
        title: "Lock extended",
        detail: (
          <>
            <span>{creator ? shortAddress(creator) : "Unknown"} </span>
            <span>extended</span>
            <Link to={`/app/lock/${kind}/${lockId}`} className="font-mono text-primary hover:underline">
              lock #{lockId}
            </Link>
            <span> to </span>
            <span className="font-medium">{newUnlockTs ? formatDate(newUnlockTs) : "(unknown)"}</span>
          </>
        ),
      }
    }
    case "beneficiary_transferred":
      return {
        ...base,
        title: "Beneficiary transferred",
        detail: (
          <>
            <span>Lock </span>
            <Link to={`/app/lock/${kind}/${lockId}`} className="font-mono text-primary hover:underline">
              #{lockId}
            </Link>
            <span> beneficiary changed to </span>
            {beneficiary ? <CopyableAddress address={beneficiary} /> : <span>(unknown)</span>}
          </>
        ),
      }
    case "lp_lock_created": {
      const lockedUntil = formatUnlockDate(unlockAtMaybe)
      const creatorName = creator ? shortAddress(creator) : "Unknown"
      return {
        ...base,
        title: "New LP lock created",
        detail: (
          <>
            <span>{creatorName} </span>
            <span>locked</span>
            <span className="font-medium"> {amount ? String(amount) : "…"} </span>
            <span>{token ? shortAddress(token) : "LP"}</span>
            <span> until </span>
            <span className="font-medium">{lockedUntil ? formatDate(lockedUntil) : "(unknown)"}</span>
          </>
        ),
      }
    }
    case "lp_lock_withdrawn":
      return {
        ...base,
        title: "LP lock withdrawn",
        detail: (
          <>
            <span>{beneficiary ? shortAddress(beneficiary) : "Unknown"} </span>
            <span>withdrew</span>
            <span className="font-medium"> {amount ? String(amount) : "…"} </span>
            <span>{token ? shortAddress(token) : "LP"}</span>
            <span> from lock </span>
            <Link to={`/app/lock/${kind}/${lockId}`} className="font-mono text-primary hover:underline">
              #{lockId}
            </Link>
          </>
        ),
      }
    case "lp_lock_extended": {
      const newUnlockTs = formatUnlockDate(unlockAtMaybe)
      return {
        ...base,
        title: "LP lock extended",
        detail: (
          <>
            <span>{creator ? shortAddress(creator) : "Unknown"} </span>
            <span>extended</span>
            <Link to={`/app/lock/${kind}/${lockId}`} className="font-mono text-primary hover:underline">
              lock #{lockId}
            </Link>
            <span> to </span>
            <span className="font-medium">{newUnlockTs ? formatDate(newUnlockTs) : "(unknown)"}</span>
          </>
        ),
      }
    }
    case "lp_beneficiary_transferred":
      return {
        ...base,
        title: "LP beneficiary transferred",
        detail: (
          <>
            <span>Lock </span>
            <Link to={`/app/lock/${kind}/${lockId}`} className="font-mono text-primary hover:underline">
              #{lockId}
            </Link>
            <span> beneficiary changed to </span>
            {beneficiary ? <CopyableAddress address={beneficiary} /> : <span>(unknown)</span>}
          </>
        ),
      }
    default:
      return null
  }
}

function iconForType(type: ActivityType) {
  switch (type) {
    case "lock_created":
    case "lp_lock_created":
      return <Lock className="h-4 w-4" />
    case "lock_withdrawn":
    case "lp_lock_withdrawn":
      return <LogOut className="h-4 w-4" />
    case "lock_extended":
    case "lp_lock_extended":
      return <GitBranch className="h-4 w-4" />
    case "beneficiary_transferred":
    case "lp_beneficiary_transferred":
      return <UserCheck className="h-4 w-4" />
    default:
      return <Coins className="h-4 w-4" />
  }
}

function badgeForType(type: ActivityType) {
  switch (type) {
    case "lock_created":
    case "lp_lock_created":
      return { label: "Created", className: "bg-primary/10 text-primary border-primary/20" }
    case "lock_withdrawn":
    case "lp_lock_withdrawn":
      return { label: "Withdrawn", className: "bg-destructive/10 text-destructive border-destructive/20" }
    case "lock_extended":
    case "lp_lock_extended":
      return { label: "Extended", className: "bg-success/10 text-success border-success/20" }
    case "beneficiary_transferred":
    case "lp_beneficiary_transferred":
      return { label: "Beneficiary", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400" }
    default:
      return { label: "Activity", className: "bg-primary/10 text-primary border-primary/20" }
  }
}

export function RecentActivity() {
  const { t } = useTranslation()
  const { events } = useContractEventContext()

  const [paused, setPaused] = useState(false)
  const [intervalMs, setIntervalMs] = useState(DEFAULT_POLL_INTERVAL_MS)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const prevEventsCountRef = useRef(0)

  const feedItems = useMemo(() => {
    const mapped = events.map((e) => eventToFeedItem(e)).filter((x): x is FeedItem => x !== null)

    // Keep newest first (events already arrives newest-first in context)
    // Enforce max 50.
    return mapped.slice(0, MAX_ITEMS)
  }, [events])

  // Auto-scroll to bottom when new items arrive (unless paused)
  useEffect(() => {
    if (paused) return
    if (!containerRef.current) return

    const newCount = feedItems.length
    const prev = prevEventsCountRef.current
    prevEventsCountRef.current = newCount

    if (newCount > prev) {
      // content is in newest-first order; we want bottom (latest) -> scrollTop = scrollHeight
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [feedItems, paused])

  // Configurable interval for auto-scroll polling (no extra RPC; only for UI update cadence if needed)
  useEffect(() => {
    const id = window.setInterval(() => {
      // If not paused, nudge scroll to keep newest in view.
      if (paused) return
      if (!containerRef.current) return
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }, intervalMs)

    return () => window.clearInterval(id)
  }, [intervalMs, paused])

  const content = feedItems.length === 0 ? (
    <Card className="p-8 text-center text-muted-foreground">
      <p>{t("discover.noRecentActivity")}</p>
    </Card>
  ) : (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
            Live
          </Badge>
          <span className="text-xs text-muted-foreground">{MAX_ITEMS} max</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? t("common.resume") : t("common.pause")}
          </button>
          {/* minimal interval control: 3s / 10s */}
          <select
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground"
            aria-label="Feed refresh interval"
          >
            <option value={3000}>3s</option>
            <option value={10000}>10s</option>
          </select>
        </div>
      </div>

      <div ref={containerRef} className="max-h-[340px] overflow-auto">
        {feedItems
          .slice()
          // ensure oldest removed as new arrive: newest-first list, but scrolling bottom should show latest at bottom.
          .map((item) => {
            const { className, label } = badgeForType(item.type)
            return (
              <Link
                key={item.id}
                to={itemHref(item)}
                className="block border-b border-border px-4 py-3 transition-colors hover:bg-secondary/30"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    {iconForType(item.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                      <Badge variant="outline" className={className + " text-[10px]"}>
                        {label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-snug">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(item.timestamp)}</span>
                </div>
              </Link>
            )
          })}
      </div>
    </div>
  )

  return (
    <section className="mt-8">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Activity className="h-5 w-5" />
        {t("discover.recentActivity")}
      </h2>
      {content}
    </section>
  )
}

