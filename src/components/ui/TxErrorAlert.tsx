import { AlertTriangle, ExternalLink } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { StructuredError } from "@/lib/errors"
import { cn } from "@/lib/utils"

export interface TxErrorAlertProps {
  error: StructuredError | null
  className?: string
}

/**
 * Renders a sanitized transaction error: title, message and — when the error
 * has one — the recovery suggestion telling the user how to fix it.
 *
 * All three fields arrive as i18n keys from `parseError`/`sanitizeError`, so
 * they are translated here rather than rendered raw.
 */
export function TxErrorAlert({ error, className }: TxErrorAlertProps) {
  const { t } = useTranslation()
  if (!error) return null

  return (
    <div
      role="alert"
      className={cn("rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm", className)}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-destructive">{t(error.title)}</p>
          <p className="text-muted-foreground">{t(error.message)}</p>
          {error.recovery && <p className="text-muted-foreground">{t(error.recovery)}</p>}
          {error.link && (
            <a
              href={error.link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {error.link.label}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
