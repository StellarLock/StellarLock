import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Info, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { xdr } from "@stellar/stellar-sdk"
import { estimateLockCost, type LockCostEstimate } from "@/lib/stellar"
import { createLogger } from "@/lib/logger"

const log = createLogger("CostEstimate")

interface CostEstimateProps {
  contractId: string
  method: string
  args: xdr.ScVal[] | null
}

const HIGH_COST_THRESHOLD = 0.5 // XLM
const DEBOUNCE_MS = 500

export function CostEstimate({ contractId, method, args }: CostEstimateProps) {
  const { t } = useTranslation()
  const [estimate, setEstimate] = useState<LockCostEstimate | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (args === null) {
      setEstimate(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    timerRef.current = setTimeout(() => {
      estimateLockCost(contractId, method, args)
        .then((result) => {
          setEstimate(result)
          setError(null)
        })
        .catch((err: unknown) => {
          setEstimate(null)
          setError(t("costEstimate.error"))
          log.error("[CostEstimate]", err)
        })
        .finally(() => {
          setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [contractId, method, args, t])

  if (args === null) return null

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium">{t("costEstimate.title")}</span>
        <span
          title={t("costEstimate.tooltip")}
          className="cursor-help text-muted-foreground"
          aria-label={t("costEstimate.tooltip")}
        >
          <Info className="h-4 w-4 text-primary" />
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-xs">{t("costEstimate.estimating")}</span>
        </div>
      )}

      {!loading && error && (
        <p className="text-xs text-muted-foreground">{error}</p>
      )}

      {!loading && estimate && (
        <>
          <dl className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <dt className="text-muted-foreground">{t("costEstimate.networkFee")}</dt>
              <dd className="font-mono">
                {estimate.networkFee.toFixed(7)} {t("costEstimate.unit")}
              </dd>
            </div>
            <div className="flex items-center justify-between text-xs">
              <dt className="text-muted-foreground">{t("costEstimate.storageFee")}</dt>
              <dd className="font-mono">
                {estimate.resourceFee.toFixed(7)} {t("costEstimate.unit")}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-1 text-xs font-medium">
              <dt>{t("costEstimate.total")}</dt>
              <dd className="font-mono">
                ~{estimate.total.toFixed(7)} {t("costEstimate.unit")}
              </dd>
            </div>
          </dl>

          {estimate.total > HIGH_COST_THRESHOLD && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-warning-foreground">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
              <span>{t("costEstimate.highCostWarning")}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
