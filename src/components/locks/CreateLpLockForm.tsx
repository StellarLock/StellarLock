import { useMemo, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Droplets, Info, Loader2 } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import type { Dex } from "@/types/lock"
import { Input, Label } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { cn, formatDate } from "@/lib/utils"
import { useWallet } from "@/hooks/useWallet"
import { useTokenBalance, useTokenAllowance } from "@/hooks/useLocks"
import { createLpLock, submitTokenApproval } from "@/lib/lp-locker"
import { CONTRACTS } from "@/lib/stellar"
import { trackEvent } from "@/lib/analytics"
import { ConfirmLockModal } from "@/components/locks/ConfirmLockModal"

const DAY = 86_400_000

export function CreateLpLockForm() {
  const { t } = useTranslation()
  const { address, signTransaction } = useWallet()
  const navigate = useNavigate()

  const [dex, setDex] = useState<Dex>("aquarius")
  const [poolShareAddress, setPoolShareAddress] = useState("")
  const [tokenA, setTokenA] = useState("")
  const [tokenB, setTokenB] = useState("")
  const [amount, setAmount] = useState("")
  const [unlockDate, setUnlockDate] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const dexes: { value: Dex; label: string; desc: string }[] = [
    { value: "aquarius", label: t("lpForm.aquarius"), desc: t("lpForm.aquariusDesc") },
    { value: "soroswap", label: t("lpForm.soroswap"), desc: t("lpForm.soroswapDesc") },
  ]

  const presets = [
    { label: t("lpForm.days90"), days: 90 },
    { label: t("lpForm.months6"), days: 182 },
    { label: t("lpForm.year1"), days: 365 },
    { label: t("lpForm.years2"), days: 730 },
  ]

  const minDate = useMemo(() => new Date(Date.now() + DAY).toISOString().slice(0, 10), [])
  const unlockTs = unlockDate ? new Date(unlockDate).getTime() : 0
  const valid =
    poolShareAddress.trim().length > 4 &&
    tokenA.trim().length > 4 &&
    tokenB.trim().length > 4 &&
    Number(amount) > 0 &&
    unlockTs > Date.now()

  const validPoolShareAddress =
    poolShareAddress.trim().length === 56 && poolShareAddress.trim().startsWith("C")
      ? poolShareAddress.trim()
      : undefined
  const { data: balance, loading: balanceLoading } = useTokenBalance(validPoolShareAddress, address ?? null)
  const { data: allowance, loading: allowanceLoading } = useTokenAllowance(
    validPoolShareAddress,
    address ?? null,
    CONTRACTS.lpLocker,
  )

  function applyPreset(days: number) {
    setUnlockDate(new Date(Date.now() + days * DAY).toISOString().slice(0, 10))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setShowConfirm(true)
  }

  async function confirmLock() {
    setSubmitting(true)
    try {
      const { id } = await createLpLock(
        {
          poolShareAddress: poolShareAddress.trim(),
          dex,
          tokenA: tokenA.trim(),
          tokenB: tokenB.trim(),
          amount: Number(amount),
          beneficiary: address!,
          unlockAt: Math.floor(unlockTs / 1000),
        },
        address!,
        signTransaction,
      )
      trackEvent("lock_create_lp", { dex })
      navigate(`/app/lock/${id}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApprove() {
    setApproving(true)
    try {
      await submitTokenApproval(
        poolShareAddress.trim(),
        address!,
        CONTRACTS.lpLocker,
        Number(amount),
        address!,
        signTransaction,
      )
      trackEvent("token_approve")
    } catch (err: unknown) {
      console.error("[approve error]", err)
    } finally {
      setApproving(false)
    }
  }

  return (
    <>
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">{t("lpForm.dex")}</legend>
        <div role="radiogroup" aria-label={t("lpForm.dex")} className="grid grid-cols-2 gap-3">
          {dexes.map((d) => (
            <button
              type="button"
              key={d.value}
              role="radio"
              aria-checked={dex === d.value}
              onClick={() => setDex(d.value)}
              className={cn(
                "flex flex-col items-start rounded-lg border p-3 text-left transition-colors cursor-pointer",
                dex === d.value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background/40 hover:border-primary/40",
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <span
                  aria-hidden="true"
                  className={cn("h-2 w-2 rounded-full", d.value === "aquarius" ? "bg-primary" : "bg-warning")}
                />
                {d.label}
              </span>
              <span className="text-xs text-muted-foreground">{d.desc}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pool">{t("lpForm.poolAddress")}</Label>
        <Input
          id="pool"
          placeholder={t("lpForm.poolPlaceholder")}
          value={poolShareAddress}
          onChange={(e) => setPoolShareAddress(e.target.value)}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          {t("lpForm.poolHint", { dex: dex === "aquarius" ? t("lpForm.aquarius") : t("lpForm.soroswap") })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="token-a">{t("lpForm.tokenA")}</Label>
          <Input
            id="token-a"
            placeholder="C…"
            value={tokenA}
            onChange={(e) => setTokenA(e.target.value)}
            className="font-mono"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="token-b">{t("lpForm.tokenB")}</Label>
          <Input
            id="token-b"
            placeholder="C…"
            value={tokenB}
            onChange={(e) => setTokenB(e.target.value)}
            className="font-mono"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lp-amount">{t("lpForm.amount")}</Label>
        <div className="flex gap-2">
          <Input
            id="lp-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1"
          />
          {validPoolShareAddress && balance != null && balance > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(balance))}
              className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium transition-colors hover:border-primary/40 cursor-pointer"
            >
              Max
            </button>
          )}
        </div>
        {validPoolShareAddress && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {balanceLoading || allowanceLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : balance != null ? (
              <>
                Balance: {balance.toLocaleString(undefined, { maximumFractionDigits: 7 })}
              </>
            ) : null}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lp-unlock">{t("lpForm.unlockDate")}</Label>
        <Input
          id="lp-unlock"
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

      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          {t("lpForm.lockInfo")}
          {unlockTs > Date.now() && (
            <>
              {" "}
              <Trans i18nKey="lpForm.liquidityUnlockOn" values={{ date: formatDate(unlockTs) }}>
                Liquidity unlocks on{" "}
                <span className="font-medium text-foreground">
                  {{ date: formatDate(unlockTs) } as unknown as string}
                </span>
                .
              </Trans>
            </>
          )}
        </span>
      </div>

      <Button type="submit" size="lg" loading={submitting} disabled={!valid}>
        <Droplets className="h-4 w-4" />
        {t("lpForm.submit")}
      </Button>
    </form>

    {showConfirm && (
      <ConfirmLockModal
        data={{
          tokenAddress: poolShareAddress.trim(),
          amount: amount,
          beneficiary: address!,
          unlockDate: unlockDate,
          isLp: true,
          dex: dex,
          poolShareAddress: poolShareAddress.trim(),
          balance,
          allowance,
          needsApproval: allowance != null && allowance < Number(amount),
        }}
        onConfirm={confirmLock}
        onApprove={handleApprove}
        onCancel={() => setShowConfirm(false)}
        loading={submitting}
        approving={approving}
      />
    )}
  </>
  )
}
