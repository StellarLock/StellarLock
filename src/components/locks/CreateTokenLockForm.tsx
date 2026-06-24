import { useMemo, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, Info, Loader2 } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Input, Label } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { useWallet } from "@/hooks/useWallet"
import { useTokenBalance } from "@/hooks/useLocks"
import { createTokenLock } from "@/lib/token-locker"
import { trackEvent } from "@/lib/analytics"
import { formatDate } from "@/lib/utils"
import { ConfirmLockModal } from "@/components/locks/ConfirmLockModal"

const DAY = 86_400_000

export function CreateTokenLockForm() {
  const { t } = useTranslation()
  const { address, signTransaction } = useWallet()
  const navigate = useNavigate()

  const [tokenAddress, setTokenAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [beneficiary, setBeneficiary] = useState("")
  const [unlockDate, setUnlockDate] = useState("")
  const [vesting, setVesting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const validTokenAddress = tokenAddress.trim().length === 56 && tokenAddress.trim().startsWith("C")
    ? tokenAddress.trim()
    : undefined
  const { data: balance, loading: balanceLoading } = useTokenBalance(validTokenAddress, address ?? null)

  const presets = [
    { label: t("tokenForm.days30"), days: 30 },
    { label: t("tokenForm.days90"), days: 90 },
    { label: t("tokenForm.months6"), days: 182 },
    { label: t("tokenForm.year1"), days: 365 },
  ]

  const minDate = useMemo(() => new Date(Date.now() + DAY).toISOString().slice(0, 10), [])
  const unlockTs = unlockDate ? new Date(unlockDate).getTime() : 0
  const valid = tokenAddress.trim().length > 4 && Number(amount) > 0 && unlockTs > Date.now()

  function applyPreset(days: number) {
    setUnlockDate(new Date(Date.now() + days * DAY).toISOString().slice(0, 10))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setError(null)
    setShowConfirm(true)
  }

  async function confirmLock() {
    setSubmitting(true)
    try {
      const { id } = await createTokenLock(
        {
          tokenAddress: tokenAddress.trim(),
          amount: Number(amount),
          beneficiary: beneficiary.trim() || address!,
          unlockAt: Math.floor(unlockTs / 1000),
          vesting: vesting
            ? { start: Math.floor(Date.now() / 1000), end: Math.floor(unlockTs / 1000) }
            : undefined,
        },
        address!,
        signTransaction,
      )
      trackEvent("lock_create_token", { vesting })
      navigate(`/app/lock/${id}`)
    } catch (err: unknown) {
      console.error("[createLock error]", err)
      setShowConfirm(false)
      if (err instanceof Error) {
        setError(err.message)
      } else if (typeof err === "object" && err !== null) {
        setError(JSON.stringify(err, null, 2))
      } else {
        setError(String(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="token">{t("tokenForm.tokenAddress")}</Label>
        <Input
          id="token"
          placeholder={t("tokenForm.tokenPlaceholder")}
          value={tokenAddress}
          onChange={(e) => setTokenAddress(e.target.value)}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          {t("tokenForm.tokenHint")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="amount">{t("tokenForm.amount")}</Label>
          {validTokenAddress && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {balanceLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : balance != null ? (
                <>
                  {t("tokenForm.balance")}: {balance.toLocaleString(undefined, { maximumFractionDigits: 7 })}
                </>
              ) : null}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            id="amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1"
          />
          {balance != null && balance > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(balance))}
              className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium transition-colors hover:border-primary/40 cursor-pointer"
            >
              {t("tokenForm.max")}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="beneficiary">{t("tokenForm.beneficiary")}</Label>
        <Input
          id="beneficiary"
          placeholder={address ?? "G…"}
          value={beneficiary}
          onChange={(e) => setBeneficiary(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t("tokenForm.beneficiaryHint")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="unlock">{t("tokenForm.unlockDate")}</Label>
        <Input
          id="unlock"
          type="date"
          min={minDate}
          value={unlockDate}
          onChange={(e) => setUnlockDate(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => applyPreset(p.days)}
              className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium transition-colors hover:border-primary/40 cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/40 p-3">
        <input
          type="checkbox"
          checked={vesting}
          onChange={(e) => setVesting(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[oklch(0.78_0.16_175)]"
        />
        <span className="text-sm">
          <span className="font-medium">{t("tokenForm.vestingLabel")}</span>
          <span className="block text-muted-foreground">
            {t("tokenForm.vestingDesc")}
          </span>
        </span>
      </label>

      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          {t("tokenForm.lockInfo")}
          {unlockTs > Date.now() && (
            <>
              {" "}
              <Trans i18nKey="tokenForm.fundsUnlockOn" values={{ date: formatDate(unlockTs) }}>
                Funds unlock on <span className="font-medium text-foreground">{{ date: formatDate(unlockTs) } as unknown as string}</span>.
              </Trans>
            </>
          )}
        </span>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      <Button type="submit" size="lg" loading={submitting} disabled={!valid}>
        <Lock className="h-4 w-4" />
        {t("tokenForm.submit")}
      </Button>
    </form>

    {showConfirm && (
      <ConfirmLockModal
        data={{
          tokenAddress: tokenAddress.trim(),
          amount: amount,
          beneficiary: beneficiary.trim() || address!,
          unlockDate: unlockDate,
          vesting,
        }}
        onConfirm={confirmLock}
        onCancel={() => setShowConfirm(false)}
        loading={submitting}
      />
    )}
  </>
  )
}
