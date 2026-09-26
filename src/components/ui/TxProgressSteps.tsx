import { Check, Circle, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { TxPhase } from "@/lib/stellar"

type TxDisplayPhase = TxPhase | "idle"

const PHASES: TxPhase[] = ["simulating", "signing", "submitting", "confirming"]

export function TxProgressSteps({ phase }: { phase: TxDisplayPhase }) {
  const { t } = useTranslation()
  
  if (phase === "idle") return null

  const currentIdx = PHASES.findIndex((p) => p === phase)

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/40 p-3"
    >
      {PHASES.map((p, i) => {
        const isDone = i < currentIdx
        const isActive = p === phase
        return (
          <div
            key={p}
            className={cn(
              "flex items-center gap-2 text-sm transition-colors",
              isActive && "text-foreground font-medium",
              isDone && "text-muted-foreground",
              !isActive && !isDone && "text-muted-foreground/40",
            )}
          >
            {isActive ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            ) : isDone ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0" />
            )}
            {t(`txProgress.${p}`)}
          </div>
        )
      })}
    </div>
  )
}
