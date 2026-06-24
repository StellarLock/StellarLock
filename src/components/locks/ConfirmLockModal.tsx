import { AlertTriangle, Lock } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { formatDate, shortAddress } from "@/lib/utils"

export interface LockConfirmData {
  tokenAddress: string
  amount: string
  beneficiary: string
  unlockDate: string // ISO date string e.g. "2025-01-01"
  vesting?: boolean
  // LP-specific
  isLp?: boolean
  dex?: string
  poolShareAddress?: string
}

interface ConfirmLockModalProps {
  data: LockConfirmData
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function ConfirmLockModal({ data, onConfirm, onCancel, loading }: ConfirmLockModalProps) {
  const unlockTs = new Date(data.unlockDate).getTime()

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
        </dl>

        <div className="flex items-start gap-2 mx-5 mb-5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span className="text-muted-foreground">
            Locks are <strong className="text-foreground">immutable</strong>. The unlock date can only be extended, never shortened. Funds cannot be recovered early.
          </span>
        </div>

        <div className="flex gap-3 border-t border-border p-5">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={onConfirm} loading={loading}>
            <Lock className="h-4 w-4" />
            Confirm & Lock
          </Button>
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
