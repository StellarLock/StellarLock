import { AlertTriangle } from "lucide-react"
import type { FieldValidationIssue } from "@/lib/validation/lockFormValidation"

import { useEffect, useMemo, useRef } from "react"


export function FormValidationErrors({
  issues,
}: {
  issues: FieldValidationIssue[]
}) {

  const firstIssue = issues[0]
  const liveId = useMemo(() => `form-validation-${Math.random().toString(16).slice(2)}`, [])
  const firstFocusRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!issues.length) return
    firstFocusRef.current?.focus?.()
  }, [issues.length])

  if (!issues.length) return null

  return (
    <div
      ref={firstFocusRef}
      tabIndex={-1}
      aria-live="polite"
      aria-atomic="true"
      role="alert"
      id={liveId}
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">{issues.length} problem{issues.length === 1 ? "" : "s"} to fix</p>
          <ul className="mt-2 space-y-2">
            {issues.map((it, idx) => (
              <li key={`${it.field}-${idx}`} className="text-sm">
                <span className="font-medium">{it.message}</span>
                {it.guidance && <div className="mt-1 text-xs text-destructive-foreground/90">{it.guidance}</div>}
                {idx === 0 && firstIssue?.field && (
                  <div className="mt-2 text-xs">
                    Tip: jump to <span className="font-mono">{it.field}</span>.
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

