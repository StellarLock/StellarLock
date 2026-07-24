import { useMemo, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, Info } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Input, Label } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { useWallet } from "@/hooks/useWallet"
import { createTokenLock } from "@/lib/token-locker"
import { trackEvent } from "@/lib/analytics"
import { addTransaction } from "@/lib/transaction-history"
import { formatDate } from "@/lib/utils"

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
  const [description, setDescription] = useState("")
  const [projectUrl, setProjectUrl] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setError(null)
    setSubmitting(true)
    try {
      const { id, hash } = await createTokenLock(
        {
          tokenAddress: tokenAddress.trim(),
          amount: Number(amount),
          beneficiary: beneficiary.trim() || address!,
          unlockAt: Math.floor(unlockTs / 1000),
          vesting: vesting
            ? { start: Math.floor(Date.now() / 1000), end: Math.floor(unlockTs / 1000) }
            : undefined,
          metadata: {
            description: description.trim(),
            projectUrl: projectUrl.trim(),
            logoUrl: logoUrl.trim(),
          },
        },
        address!,
        signTransaction,
      )
      addTransaction({
        hash,
        action: "create_token_lock",
        kind: "token",
        address: address!,
        lockId: id,
        token: tokenAddress.trim(),
        amount: Number(amount),
      })
      trackEvent("lock_create_token", { vesting })
      navigate(`/app/lock/${id}`)
    } catch (err: unknown) {
      console.error("[createLock error]", err)
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
        <Label htmlFor="amount">{t("tokenForm.amount")}</Label>
        <Input
          id="amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
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

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-3">
        <div>
          <p className="text-sm font-medium">{t("tokenForm.metadataTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("tokenForm.metadataDesc")}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="description">{t("tokenForm.description")}</Label>
          <Input
            id="description"
            placeholder={t("tokenForm.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-url">{t("tokenForm.projectUrl")}</Label>
          <Input
            id="project-url"
            type="url"
            placeholder="https://…"
            value={projectUrl}
            onChange={(e) => setProjectUrl(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="logo-url">{t("tokenForm.logoUrl")}</Label>
          <Input
            id="logo-url"
            type="url"
            placeholder="https://…"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
        </div>
      </div>

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
  )
}
