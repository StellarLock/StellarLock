import type { Dex } from "@/types/lock"
import { cn } from "@/lib/utils"

const LABELS: Record<Dex, string> = {
  aquarius: "Aquarius",
  soroswap: "Soroswap",
}

export function DexBadge({ dex, className }: { dex: Dex; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dex === "aquarius" ? "bg-primary" : "bg-warning")} aria-hidden />
      {LABELS[dex]}
    </span>
  )
}
