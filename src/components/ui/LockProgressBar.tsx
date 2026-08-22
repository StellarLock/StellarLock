import { cn } from "@/lib/utils"

export function LockProgressBar({
  createdAt,
  unlockAt,
  className,
  showLabel = true,
}: {
  createdAt: number
  unlockAt: number
  className?: string
  showLabel?: boolean
}) {
  const total = Math.max(1, unlockAt - createdAt)
  const elapsed = Date.now() - createdAt
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100))
  const done = pct >= 100

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-labelledby="lock-progress-label"
      >
        <div
          className={cn("h-full rounded-full transition-all", done ? "bg-success" : "bg-primary")}
          style={{ width: pct + "%" }}
        />
      </div>
      <span id="lock-progress-label" className="sr-only">
        Lock progress
      </span>
      {showLabel && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{pct.toFixed(0)}% elapsed</span>
          <span>{done ? "Ready to withdraw" : (100 - pct).toFixed(0) + "% remaining"}</span>
        </div>
      )}
    </div>
  )
}
