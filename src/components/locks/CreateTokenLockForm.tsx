import { useMemo, useState, useEffect, useRef, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, Info, Loader2, Calendar, ChevronDown, ChevronUp } from "lucide-react"
import { Lock, Info, Loader2, Calendar, Users } from "lucide-react"
import { Lock, Info, Loader2, Calendar, Timer } from "lucide-react"
import { Trans, useTranslation } from "react-i18next"
import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk"
import { Input, Label } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { TxProgressSteps } from "@/components/ui/TxProgressSteps"
import { useWallet } from "@/hooks/useWallet"
import { useTokenBalance, useTokenAllowance } from "@/hooks/useLocks"
import { createTokenLock,  } from "@/lib/token-locker"
import { CONTRACTS, submitTokenApproval } from "@/lib/stellar"
import { useTokenBalance } from "@/hooks/useLocks"
import { createTokenLock } from "@/lib/token-locker"
import { createSplitLock, type SplitBeneficiary } from "@/lib/split-lock"
import { trackEvent } from "@/lib/analytics"
import { cn, formatDate, formatError, isValidStellarAddress } from "@/lib/utils"
import { formatDate, formatError, isValidStellarAddress } from "@/lib/utils"
import { CONTRACTS, type TxPhase } from "@/lib/stellar"
import { CONTRACTS } from "@/lib/stellar"
import { ConfirmLockModal } from "@/components/locks/ConfirmLockModal"
import { isValidStellarAddress, isValidStellarContractAddress } from "@/lib/stellar"
import { CostEstimate } from "@/components/locks/CostEstimate"
import { MultiBeneficiaryFields } from "@/components/locks/MultiBeneficiaryFields"

const DAY = 86_400_000

type VestingTemplate = "none" | "linear6m" | "linear1y" | "linear2y" | "quarterly"

interface VestingTemplateConfig {
  label: string
  durationMonths?: number
  releases?: number
}

export function CreateTokenLockForm() {
  const { t } = useTranslation()
  const { address, signTransaction } = useWallet()
  const navigate = useNavigate()

  const [tokenAddress, setTokenAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [beneficiary, setBeneficiary] = useState("")
  const [unlockDate, setUnlockDate] = useState("")
  const [vesting, setVesting] = useState(false)
  const [vestingTemplate, setVestingTemplate] = useState<VestingTemplate>("none")
  const [vestingStartDate, setVestingStartDate] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [txPhase, setTxPhase] = useState<TxPhase | "idle">("idle")
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)
  const [description, setDescription] = useState("")
  const [projectUrl, setProjectUrl] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [multiMode, setMultiMode] = useState(false)
  const [splitBeneficiaries, setSplitBeneficiaries] = useState<SplitBeneficiary[]>([
    { address: "", shareBps: 5000 },
    { address: "", shareBps: 5000 },
  ])
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const COOLDOWN_SECONDS = 60
  const COOLDOWN_KEY = "stellarlock:last_lock_created_at"

  useEffect(() => {
    const stored = localStorage.getItem(COOLDOWN_KEY)
    if (stored) {
      const elapsed = Math.floor((Date.now() - Number(stored)) / 1000)
      const remaining = COOLDOWN_SECONDS - elapsed
      if (remaining > 0) setCooldownRemaining(remaining)
    }
  }, [])

  useEffect(() => {
    if (cooldownRemaining <= 0) {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
      return
    }
    cooldownRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [cooldownRemaining])

  const vestingTemplates: Record<VestingTemplate, VestingTemplateConfig> = {
    none: { label: t("tokenForm.vestingTemplateCustom") },
    linear6m: { label: t("tokenForm.vestingTemplateLinear6m"), durationMonths: 6 },
    linear1y: { label: t("tokenForm.vestingTemplateLinear1y"), durationMonths: 12 },
    linear2y: { label: t("tokenForm.vestingTemplateLinear2y"), durationMonths: 24 },
    quarterly: { label: t("tokenForm.vestingTemplateQuarterly"), durationMonths: 12, releases: 4 },
  }

  const trimmedTokenAddress = tokenAddress.trim()
  const trimmedBeneficiary = beneficiary.trim()
  const effectiveBeneficiary = trimmedBeneficiary || address || ""
  const validTokenAddress = isValidStellarContractAddress(trimmedTokenAddress) ? trimmedTokenAddress : undefined
  const { data: balance, loading: balanceLoading } = useTokenBalance(validTokenAddress, address ?? null)
  const { data: allowance, loading: allowanceLoading } = useTokenAllowance(
    validTokenAddress,
    address ?? null,
    CONTRACTS.tokenLocker,
  )

  const presets = [
    { label: t("tokenForm.days30"), days: 30 },
    { label: t("tokenForm.days90"), days: 90 },
    { label: t("tokenForm.months6"), days: 182 },
    { label: t("tokenForm.year1"), days: 365 },
  ]

  const minDate = useMemo(() => new Date(Date.now() + DAY).toISOString().slice(0, 10), [])
  const unlockTs = unlockDate ? new Date(unlockDate).getTime() : 0
  const vestingStartTs = vestingStartDate ? new Date(vestingStartDate).getTime() : 0
  const tokenAddressValid = isValidStellarContractAddress(trimmedTokenAddress)
  const beneficiaryValid = isValidStellarAddress(effectiveBeneficiary)
  const valid = tokenAddressValid && beneficiaryValid && Number(amount) > 0 && unlockTs > Date.now()
  const splitSharesOk =
    splitBeneficiaries.length >= 2 &&
    splitBeneficiaries.every((b) => isValidStellarAddress(b.address)) &&
    splitBeneficiaries.reduce((s, b) => s + b.shareBps, 0) === 10_000

  const valid =
    isValidStellarAddress(tokenAddress.trim()) &&
    Number(amount) > 0 &&
    unlockTs > Date.now() &&
    (!multiMode || splitSharesOk)

  // Build the contract args for cost estimation when form is sufficiently filled in
  const costArgs = useMemo((): xdr.ScVal[] | null => {
    try {
      if (!validTokenAddress || !address || Number(amount) <= 0 || unlockTs <= Date.now()) return null
      const beneficiaryAddr = beneficiary.trim().length > 0 ? beneficiary.trim() : address
      const amountStroops = BigInt(Math.round(Number(amount) * 1e7))
      const args: xdr.ScVal[] = [
        new Address(address).toScVal(),
        new Address(validTokenAddress).toScVal(),
        nativeToScVal(amountStroops, { type: "i128" }),
        new Address(beneficiaryAddr).toScVal(),
        nativeToScVal(BigInt(Math.floor(unlockTs / 1000)), { type: "u64" }),
      ]
      if (vesting) {
        args.push(
          xdr.ScVal.scvMap([
            new xdr.ScMapEntry({
              key: xdr.ScVal.scvSymbol("end"),
              val: nativeToScVal(BigInt(Math.floor(unlockTs / 1000)), { type: "u64" }),
            }),
            new xdr.ScMapEntry({
              key: xdr.ScVal.scvSymbol("released"),
              val: nativeToScVal(BigInt(0), { type: "i128" }),
            }),
            new xdr.ScMapEntry({
              key: xdr.ScVal.scvSymbol("start"),
              val: nativeToScVal(BigInt(Math.floor(Date.now() / 1000)), { type: "u64" }),
            }),
          ]),
        )
      } else {
        args.push(xdr.ScVal.scvVoid())
      }
      return args
    } catch {
      return null
    }
  }, [validTokenAddress, address, amount, beneficiary, unlockTs, vesting])

  function applyPreset(days: number) {
    setUnlockDate(new Date(Date.now() + days * DAY).toISOString().slice(0, 10))
  }

  function applyVestingTemplate(template: VestingTemplate) {
    setVestingTemplate(template)
    if (template === "none") {
      setVesting(false)
      setVestingStartDate("")
      setUnlockDate("")
    } else {
      setVesting(true)
      const config = vestingTemplates[template]
      const now = new Date()
      const startDate = now.toISOString().slice(0, 10)
      setVestingStartDate(startDate)

      if (config.durationMonths) {
        const endDate = new Date(now.getTime() + config.durationMonths * 30 * DAY)
        setUnlockDate(endDate.toISOString().slice(0, 10))
      }
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setError(null)
    setShowConfirm(true)
  }

  async function confirmLock() {
    setSubmitting(true)
    setTxPhase("simulating")
    try {
      if (multiMode) {
        await createSplitLock(
          {
            tokenAddress: tokenAddress.trim(),
            totalAmount: Number(amount),
            beneficiaries: splitBeneficiaries,
            unlockAt: Math.floor(unlockTs / 1000),
            vesting: vesting ? { start: Math.floor(Date.now() / 1000), end: Math.floor(unlockTs / 1000) } : undefined,
          },
          address!,
          signTransaction,
        )
        trackEvent("lock_create_split", { count: splitBeneficiaries.length, vesting })
        navigate("/app/locks")
      } else {
        const { id } = await createTokenLock(
          {
            tokenAddress: tokenAddress.trim(),
            amount: Number(amount),
            beneficiary: beneficiary.trim() || address!,
            unlockAt: Math.floor(unlockTs / 1000),
            vesting: vesting ? { start: Math.floor(Date.now() / 1000), end: Math.floor(unlockTs / 1000) } : undefined,
          },
          address!,
          signTransaction,
        )
        trackEvent("lock_create_token", { vesting })
        navigate(`/app/lock/${id}`)
      }
      const { id } = await createTokenLock(
        {
          tokenAddress: tokenAddress.trim(),
          amount: Number(amount),
          beneficiary: beneficiary.trim() || address!,
          unlockAt: Math.floor(unlockTs / 1000),
          vesting: vesting ? { start: Math.floor(Date.now() / 1000), end: Math.floor(unlockTs / 1000) } : undefined,
        },
        address!,
        signTransaction,
        setTxPhase,
      )
      trackEvent("lock_create_token", { vesting })
      localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
      setCooldownRemaining(COOLDOWN_SECONDS)
      navigate(`/app/lock/${id}`)
    } catch (err: unknown) {
      console.error("[createLock error]", err)
      setShowConfirm(false)
      setError(formatError(err))
    } finally {
      setSubmitting(false)
      setTxPhase("idle")
    }
  }

  async function handleApprove() {
    setApproving(true)
    try {
      await submitTokenApproval(
        tokenAddress.trim(),
        address!,
        CONTRACTS.tokenLocker,
        Number(amount),
        address!,
        signTransaction,
      )
      trackEvent("token_approve")
    } catch (err: unknown) {
      console.error("[approve error]", err)
      if (err instanceof Error) {
        setError(err.message)
      } else if (typeof err === "object" && err !== null) {
        setError(JSON.stringify(err, null, 2))
      } else {
        setError(String(err))
      }
    } finally {
      setApproving(false)
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
          aria-invalid={!!trimmedTokenAddress && !tokenAddressValid}
        />
        <p className="text-xs text-muted-foreground">{t("tokenForm.tokenHint")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="amount">{t("tokenForm.amount")}</Label>
          {validTokenAddress && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {balanceLoading || allowanceLoading ? (
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
          aria-invalid={!!trimmedBeneficiary && !beneficiaryValid}
      {/* Multiple beneficiaries toggle */}
      <label className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        multiMode ? "border-primary/40 bg-primary/5" : "border-border bg-background/40",
      )}>
        <input
          type="checkbox"
          checked={multiMode}
          onChange={(e) => setMultiMode(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[oklch(0.78_0.16_175)]"
        />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Users className="h-3.5 w-3.5" />
            {t("splitLock.toggle")}
          </span>
          <span className="block text-muted-foreground">{t("splitLock.toggleDesc")}</span>
        </span>
      </label>

      {multiMode ? (
        <MultiBeneficiaryFields beneficiaries={splitBeneficiaries} onChange={setSplitBeneficiaries} />
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="beneficiary">{t("tokenForm.beneficiary")}</Label>
          <Input
            id="beneficiary"
            placeholder={address ?? "G…"}
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("tokenForm.beneficiaryHint")}</p>
        </div>
      )}

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

      <div className="flex flex-col gap-2">
        <Label htmlFor="vestingTemplate">{t("tokenForm.vestingTemplate")}</Label>
        <select
          id="vestingTemplate"
          value={vestingTemplate}
          onChange={(e) => applyVestingTemplate(e.target.value as VestingTemplate)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-border/80"
        >
          <option value="none">{t("tokenForm.vestingTemplateCustom")}</option>
          <option value="linear6m">{t("tokenForm.vestingTemplateLinear6m")}</option>
          <option value="linear1y">{t("tokenForm.vestingTemplateLinear1y")}</option>
          <option value="linear2y">{t("tokenForm.vestingTemplateLinear2y")}</option>
          <option value="quarterly">{t("tokenForm.vestingTemplateQuarterly")}</option>
        </select>
        <p className="text-xs text-muted-foreground">{t("tokenForm.vestingTemplateHint")}</p>
      </div>

      {vesting && vestingTemplate !== "none" && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{t("tokenForm.vestingLabel")}</span>
          </div>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">{t("tokenForm.vestingStart")}: </span>
              <span className="font-medium">{vestingStartDate || formatDate(Date.now())}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{t("tokenForm.vestingEnd")}: </span>
              <span className="font-medium">{unlockDate ? formatDate(new Date(unlockDate).getTime()) : "—"}</span>
            </p>
            {vestingTemplate === "quarterly" && (
              <div className="mt-2 space-y-1 border-t border-primary/20 pt-2">
                <p className="text-xs text-muted-foreground">Release schedule:</p>
                <div className="flex gap-2 text-xs">
                  {[1, 2, 3, 4].map((quarter) => {
                    const startTs = vestingStartTs || Date.now()
                    const endTs = unlockTs || Date.now()
                    const quarterDuration = (endTs - startTs) / 4
                    const releaseDate = new Date(startTs + quarterDuration * quarter)
                    return (
                      <span key={quarter} className="rounded bg-primary/10 px-2 py-1">
                        Q{quarter}: {formatDate(releaseDate.getTime())}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {vesting && vestingTemplate === "none" && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/40 p-3">
          <input
            type="checkbox"
            checked={vesting}
            onChange={(e) => setVesting(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[oklch(0.78_0.16_175)]"
          />
          <span className="text-sm">
            <span className="font-medium">{t("tokenForm.vestingLabel")}</span>
            <span className="block text-muted-foreground">{t("tokenForm.vestingDesc")}</span>
          </span>
        </label>
      )}

      {/* Lock Details (optional metadata) */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setMetaOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/40"
          aria-expanded={metaOpen}
        >
          <span>Lock Details <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span></span>
          {metaOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {metaOpen && (
          <div className="flex flex-col gap-4 border-t border-border px-4 pb-4 pt-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meta-desc">Description</Label>
              <textarea
                id="meta-desc"
                rows={3}
                maxLength={280}
                placeholder="Why is this lock being created? (e.g. Team tokens locked for 2 years)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-right text-xs text-muted-foreground">{description.length}/280</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meta-url">Project URL</Label>
              <Input
                id="meta-url"
                type="url"
                placeholder="https://your-project.com"
                value={projectUrl}
                onChange={(e) => setProjectUrl(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meta-logo">Logo URL</Label>
              <Input
                id="meta-logo"
                type="url"
                placeholder="https://your-project.com/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          {t("tokenForm.lockInfo")}
          {unlockTs > Date.now() && (
            <>
              {" "}
              <Trans i18nKey="tokenForm.fundsUnlockOn" values={{ date: formatDate(unlockTs) }}>
                Funds unlock on{" "}
                <span className="font-medium text-foreground">
                  {{ date: formatDate(unlockTs) } as unknown as string}
                </span>
                .
              </Trans>
            </>
          )}
        </span>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}
      </div>

      <CostEstimate
        contractId={CONTRACTS.tokenLocker}
        method="create_lock"
        args={costArgs}
      />

      {cooldownRemaining > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <Timer className="h-4 w-4 shrink-0 text-primary animate-pulse" />
          <span>
            Rate limit: next lock available in{" "}
            <span className="font-semibold tabular-nums text-foreground">{cooldownRemaining}s</span>
          </span>
        </div>
      )}

      <Button type="submit" size="lg" loading={submitting} disabled={!valid || cooldownRemaining > 0}>
        <Lock className="h-4 w-4" />
        {multiMode ? t("splitLock.submit") : t("tokenForm.submit")}
        {cooldownRemaining > 0 ? `Wait ${cooldownRemaining}s…` : t("tokenForm.submit")}
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
      <>
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
        <div className="fixed bottom-6 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 px-4">
          <TxProgressSteps phase={txPhase} />
        </div>
      </>
    )}
  </>
  )
}
