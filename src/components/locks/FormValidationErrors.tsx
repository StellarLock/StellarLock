import { AlertTriangle } from "lucide-react"
import type { FieldValidationIssue } from "@/lib/validation/lockFormValidation"
import { useAnnouncer } from "@/hooks/useAnnouncer"

import { useEffect, useMemo } from "react"

export function FormValidationErrors({ issues }: { issues: FieldValidationIssue[] }) {
  const firstIssue = issues[0]
  const { announce } = useAnnouncer()
  const liveId = useMemo(() => `form-validation-${Math.random().toString(16).slice(2)}`, [])

  // The forms revalidate on every keystroke, so the summary string doubles as
  // the effect's dependency: announcing on array identity would interrupt the
  // screen reader on every character typed.
  const summary = issues.length
    ? `${issues.length} problem${issues.length === 1 ? "" : "s"} to fix. ${issues[0].message}`
    : ""

  // Route through the app-wide announcer so validation failures are spoken
  // consistently with the rest of the app's dynamic updates.
  useEffect(() => {
    if (!summary) return
    announce(summary, "assertive")
  }, [summary, announce])

  if (!issues.length) return null

  return (
    <div
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
          <p className="font-medium">
            {issues.length} problem{issues.length === 1 ? "" : "s"} to fix
          </p>
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
