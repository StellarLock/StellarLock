import { Check, Circle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TxPhase } from "@/lib/stellar"

type TxDisplayPhase = TxPhase | "idle"

const STEPS: { phase: TxPhase; label: string }[] = [
  { phase: "simulating", label: "Simulating transaction…" },
  { phase: "signing", label: "Please sign in your wallet…" },
  { phase: "submitting", label: "Submitting to network…" },
  { phase: "confirming", label: "Waiting for confirmation…" },
]

export function TxProgressSteps({ phase }: { phase: TxDisplayPhase }) {
  if (phase === "idle") return null

  const currentIdx = STEPS.findIndex((s) => s.phase === phase)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/40 p-3">
      {STEPS.map((step, i) => {
        const isDone = i < currentIdx
        const isActive = step.phase === phase
        return (
          <div
            key={step.phase}
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
            {step.label}
          </div>
        )
      })}
    </div>
  )
}
