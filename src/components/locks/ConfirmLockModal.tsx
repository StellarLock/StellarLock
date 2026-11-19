import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { useModalFocusTrap } from "@/lib/modalFocusTrap"
import { AlertTriangle, Lock, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { formatDate, shortAddress } from "@/lib/utils"

export interface LockConfirmData {
  tokenAddress: string
  amount: string
  beneficiary: string
  unlockDate: string
  vesting?: boolean
  balance?: number | null
  allowance?: number | null
  needsApproval?: boolean
  isLp?: boolean
  dex?: string
  poolShareAddress?: string
}

interface ConfirmLockModalProps {
  data: LockConfirmData
  onConfirm: () => void
  onApprove?: () => void
  onCancel: () => void
  loading?: boolean
  approving?: boolean
}

export function ConfirmLockModal({ data, onConfirm, onApprove, onCancel, loading, approving }: ConfirmLockModalProps) {
  const { t } = useTranslation()
  const unlockTs = new Date(data.unlockDate).getTime()
  const isInvalidDate = Number.isNaN(unlockTs)
  const amount = Number(data.amount)
  const hasInsufficientBalance = data.balance != null && data.balance < amount
  const needsApproval = data.needsApproval || (data.allowance != null && data.allowance < amount)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)
  useModalFocusTrap({
    active: true,
    containerRef,
    initialFocusRef: cancelBtnRef,
    onEscape: onCancel,
  })

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-lock-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="border-b border-border p-5">
          <h2 id="confirm-lock-title" className="text-lg font-semibold">
            {data.isLp
              ? t("confirmLockModal.titleLp")
              : t("confirmLockModal.titleToken")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("confirmLockModal.review")}</p>
        </div>

        {isInvalidDate ? (
          <div className="mx-5 my-5 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{t("confirmLockModal.invalidDateTitle")}</strong>{" "}
                {t("confirmLockModal.invalidDateDescription")}
              </span>
            </div>
          </div>
        ) : (
          <dl className="flex flex-col gap-3 p-5 text-sm">
            {data.isLp ? (
              <>
                <Row
                  label={t("confirmLockModal.poolShareAddress")}
                  value={<span className="font-mono">{shortAddress(data.poolShareAddress ?? "", 8, 8)}</span>}
                />
                <Row label={t("confirmLockModal.dex")} value={<span className="capitalize">{data.dex}</span>} />
              </>
            ) : (
              <Row
                label={t("confirmLockModal.tokenAddress")}
                value={<span className="font-mono">{shortAddress(data.tokenAddress, 8, 8)}</span>}
              />
            )}
            <Row label={t("confirmLockModal.amount")} value={<span className="font-semibold">{data.amount}</span>} />
            <Row
              label={t("confirmLockModal.beneficiary")}
              value={<span className="font-mono">{shortAddress(data.beneficiary, 8, 8)}</span>}
            />
            <Row label={t("confirmLockModal.unlockDate")} value={<span className="font-medium">{formatDate(unlockTs)}</span>} />
            {data.vesting && (
              <Row
                label={t("confirmLockModal.vesting")}
                value={<span className="text-primary">{t("confirmLockModal.vestingEnabled")}</span>}
              />
            )}
            {data.balance != null && (
              <Row
                label={t("confirmLockModal.yourBalance")}
                value={
                  <span className={hasInsufficientBalance ? "text-destructive" : "text-foreground"}>
                    {data.balance.toLocaleString(undefined, { maximumFractionDigits: 7 })}
                  </span>
                }
              />
            )}
            {data.allowance != null && (
              <Row
                label={t("confirmLockModal.currentAllowance")}
                value={
                  <span className={needsApproval ? "text-destructive" : "text-foreground"}>
                    {data.allowance.toLocaleString(undefined, { maximumFractionDigits: 7 })}
                  </span>
                }
              />
            )}
          </dl>
        )}

        {hasInsufficientBalance && (
          <div className="mx-5 mb-5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{t("confirmLockModal.insufficientBalanceTitle")}</strong>{" "}
                {t("confirmLockModal.insufficientBalanceDescription", {
                  balance: data.balance?.toLocaleString(undefined, { maximumFractionDigits: 7 }),
                  amount: amount.toLocaleString(undefined, { maximumFractionDigits: 7 }),
                })}
              </span>
            </div>
          </div>
        )}

        {needsApproval && !hasInsufficientBalance && (
          <div className="mx-5 mb-5 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="font-medium text-foreground">{t("confirmLockModal.approvalRequired")}</p>
                <p className="mt-1 text-muted-foreground">
                  {t("confirmLockModal.approvalRequiredDescription")}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 mx-5 mb-5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span className="text-muted-foreground">
            {t("confirmLockModal.immutableWarningPrefix")}{" "}
            <strong className="text-foreground">{t("confirmLockModal.immutableWarningEmphasis")}</strong>
            {t("confirmLockModal.immutableWarningSuffix")}
          </span>
        </div>

        <div className="flex gap-3 border-t border-border p-5">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading || approving}>
            {t("confirmLockModal.cancel")}
          </Button>
          {isInvalidDate ? (
            <Button className="flex-1" disabled>
              {t("confirmLockModal.invalidDateButton")}
            </Button>
          ) : hasInsufficientBalance ? (
            <Button className="flex-1" disabled>
              {t("confirmLockModal.insufficientBalanceButton")}
            </Button>
          ) : needsApproval && onApprove ? (
            <Button className="flex-1" onClick={onApprove} loading={approving}>
              <CheckCircle2 className="h-4 w-4" />
              {approving ? t("confirmLockModal.approving") : t("confirmLockModal.approveAndContinue")}
            </Button>
          ) : (
            <Button className="flex-1" onClick={onConfirm} loading={loading}>
              <Lock className="h-4 w-4" />
              {t("confirmLockModal.confirmAndLock")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end">{value}</dd>
    </div>
  )
}
