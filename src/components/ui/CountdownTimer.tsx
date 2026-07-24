import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

function diff(target: number) {
  const ms = Math.max(0, target - Date.now())
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return { ms, days, hours, minutes, seconds }
}

const pad = (n: number) => String(n).padStart(2, "0")

export function CountdownTimer({
  target,
  className,
  compact,
}: {
  target: number
  className?: string
  compact?: boolean
}) {
  const [t, setT] = useState(() => diff(target))

  useEffect(() => {
    setT(diff(target))
    const id = setInterval(() => setT(diff(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  if (t.ms <= 0) {
    return <span className={cn("font-mono text-success", className)}>Unlocked</span>
  }

  if (compact) {
    return (
      <span className={cn("font-mono tabular-nums", className)}>
        {t.days > 0 ? `${t.days}d ` : ""}
        {pad(t.hours)}:{pad(t.minutes)}:{pad(t.seconds)}
      </span>
    )
  }

  const cells = [
    { label: "Days", value: t.days },
    { label: "Hours", value: t.hours },
    { label: "Min", value: t.minutes },
    { label: "Sec", value: t.seconds },
  ]

  return (
    <div className={cn("flex gap-2", className)}>
      {cells.map((c) => (
        <div
          key={c.label}
          className="flex min-w-14 flex-col items-center rounded-lg border border-border bg-background/50 px-3 py-2"
        >
          <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{pad(c.value)}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</span>
        </div>
      ))}
    </div>
  )
}
