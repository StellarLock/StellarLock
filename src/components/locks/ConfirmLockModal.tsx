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

export function ConfirmLockModal({
  data,
  onConfirm,
  onApprove,
  onCancel,
  loading,
  approving,
}: ConfirmLockModalProps) {
  const unlockTs = new Date(data.unlockDate).getTime()
  const amount = Number(data.amount)
  const hasInsufficientBalance =
    data.balance != null && data.balance < amount
  const needsApproval = data.needsApproval || (data.allowance != null && data.allowance < amount)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-lock-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="border-b border-border p-5">
          <h2 id="confirm-lock-title" className="text-lg font-semibold">
            {data.isLp ? "Confirm LP Lock" : "Confirm Token Lock"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Review the details before signing.</p>
        </div>

        <dl className="flex flex-col gap-3 p-5 text-sm">
          {data.isLp ? (
            <>
              <Row label="Pool share address" value={<span className="font-mono">{shortAddress(data.poolShareAddress ?? "", 8, 8)}</span>} />
              <Row label="DEX" value={<span className="capitalize">{data.dex}</span>} />
            </>
          ) : (
            <Row label="Token address" value={<span className="font-mono">{shortAddress(data.tokenAddress, 8, 8)}</span>} />
          )}
          <Row label="Amount" value={<span className="font-semibold">{data.amount}</span>} />
          <Row label="Beneficiary" value={<span className="font-mono">{shortAddress(data.beneficiary, 8, 8)}</span>} />
          <Row label="Unlock date" value={<span className="font-medium">{formatDate(unlockTs)}</span>} />
          {data.vesting && (
            <Row label="Vesting" value={<span className="text-primary">Linear vesting enabled</span>} />
          )}
          {data.balance != null && (
            <Row
              label="Your balance"
              value={
                <span className={hasInsufficientBalance ? "text-destructive" : "text-foreground"}>
                  {data.balance.toLocaleString(undefined, { maximumFractionDigits: 7 })}
                </span>
              }
            />
          )}
          {data.allowance != null && (
            <Row
              label="Current allowance"
              value={
                <span className={needsApproval ? "text-destructive" : "text-foreground"}>
                  {data.allowance.toLocaleString(undefined, { maximumFractionDigits: 7 })}
                </span>
              }
            />
          )}
        </dl>

        {hasInsufficientBalance && (
          <div className="mx-5 mb-5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive-foreground">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Insufficient balance.</strong> You have{" "}
                <span className="font-medium">{data.balance?.toLocaleString(undefined, { maximumFractionDigits: 7 })}</span>{" "}
                but are trying to lock{" "}
                <span className="font-medium">{amount.toLocaleString(undefined, { maximumFractionDigits: 7 })}</span>.
              </span>
            </div>
          </div>
        )}

        {needsApproval && !hasInsufficientBalance && (
          <div className="mx-5 mb-5 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Approval required</p>
                <p className="mt-1 text-muted-foreground">
                  You need to approve the contract to transfer your tokens before locking. This is a one-time setup per token.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 mx-5 mb-5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span className="text-muted-foreground">
            Locks are <strong className="text-foreground">immutable</strong>. The unlock date can only be extended, never shortened. Funds cannot be recovered early.
          </span>
        </div>

        <div className="flex gap-3 border-t border-border p-5">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading || approving}>
            Cancel
          </Button>
          {hasInsufficientBalance ? (
            <Button className="flex-1" disabled>
              Insufficient Balance
            </Button>
          ) : needsApproval && onApprove ? (
            <Button className="flex-1" onClick={onApprove} loading={approving}>
              <CheckCircle2 className="h-4 w-4" />
              {approving ? "Approving..." : "Approve & Continue"}
            </Button>
          ) : (
            <Button className="flex-1" onClick={onConfirm} loading={loading}>
              <Lock className="h-4 w-4" />
              Confirm & Lock
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
      <dd className="text-right">{value}</dd>
    </div>
  )
}
