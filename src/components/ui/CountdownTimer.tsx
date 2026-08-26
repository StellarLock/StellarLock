import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()
  const [timeLeft, setTimeLeft] = useState(() => diff(target))

  useEffect(() => {
    setTimeLeft(diff(target))
    const id = setInterval(() => setTimeLeft(diff(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  if (timeLeft.ms <= 0) {
    return <span className={cn("font-mono text-success", className)}>{t("countdown.unlocked")}</span>
  }

  if (compact) {
    return (
      <span className={cn("font-mono tabular-nums", className)}>
        {timeLeft.days > 0 ? `${timeLeft.days}d ` : ""}
        {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
      </span>
    )
  }

  const cells = [
    { label: t("countdown.days"), value: timeLeft.days },
    { label: t("countdown.hours"), value: timeLeft.hours },
    { label: t("countdown.min"), value: timeLeft.minutes },
    { label: t("countdown.sec"), value: timeLeft.seconds },
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
