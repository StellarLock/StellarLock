import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Coins, Droplets, ArrowLeft, ArrowRight, Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/Button"
import { Card } from "@/components/ui/Card"
import { cn, formatDate } from "@/lib/utils"
import { Input, Label } from "@/components/ui/Input"
import { useWallet } from "@/hooks/useWallet"
import { useTokenBalanceSWR } from "@/hooks/useTokenBalanceSWR"
import { isValidStellarContractAddress, isValidStellarAddress } from "@/lib/stellar"
import { createTokenLock } from "@/lib/token-locker"
import { createLpLock } from "@/lib/lp-locker"
import { sanitizeError } from "@/lib/error-sanitizer"
import type { StructuredError } from "@/lib/errors"
import type { Dex } from "@/types/lock"
import { TxErrorAlert } from "@/components/ui/TxErrorAlert"
import { TxProgressSteps } from "@/components/ui/TxProgressSteps"
import type { TxPhase } from "@/lib/stellar"
import { addNotification } from "@/hooks/useNotifications"
import { validateTokenLockForm, validateLpLockForm } from "@/lib/validation/lockFormValidation"

type LockType = "token" | "lp"

interface WizardState {
  // Step 1
  lockType: LockType
  // Step 2
  tokenAddress: string
  poolShareAddress: string
  dex: Dex
  tokenA: string
  tokenB: string
  // Step 3
  amount: string
  beneficiary: string
  unlockDate: string
  vesting: boolean
  // Step 4: Review (computed)
}

const STORAGE_KEY = "stellarlock:wizard:state"
const DAY = 86_400_000

function saveState(state: WizardState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage errors
  }
}

function loadState(): WizardState | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as WizardState) : null
  } catch {
    return null
  }
}

function clearState() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore
  }
}

export function LockCreationWizard() {
  const { t } = useTranslation()
  const { address, signTransaction } = useWallet()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [state, setState] = useState<WizardState>(() => {
    const saved = loadState()
    return (
      saved || {
        lockType: "token",
        tokenAddress: "",
        poolShareAddress: "",
        dex: "aquarius",
        tokenA: "",
        tokenB: "",
        amount: "",
        beneficiary: "",
        unlockDate: "",
        vesting: false,
      }
    )
  })
  const [submitting, setSubmitting] = useState(false)
  const [txPhase, setTxPhase] = useState<TxPhase | "idle">("idle")
  const [error, setError] = useState<StructuredError | null>(null)

  useEffect(() => {
    saveState(state)
  }, [state])

  function updateState(updates: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...updates }))
  }

  function goNext() {
    if (currentStep < 5) setCurrentStep(currentStep + 1)
  }

  function goBack() {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setTxPhase("simulating")
    setError(null)
    try {
      const unlockAt = new Date(state.unlockDate).getTime()
      let lockId: string
      if (state.lockType === "token") {
        const created = await createTokenLock(
          {
            tokenAddress: state.tokenAddress.trim(),
            amount: Number(state.amount),
            beneficiary: state.beneficiary.trim() || address!,
            unlockAt: Math.floor(new Date(state.unlockDate).getTime() / 1000),
            vesting: state.vesting
              ? { start: Math.floor(Date.now() / 1000), end: Math.floor(new Date(state.unlockDate).getTime() / 1000) }
              : undefined,
            metadata: {},
          },
          address!,
          signTransaction,
          setTxPhase,
        )
        lockId = created.id
      } else {
        const created = await createLpLock(
          {
            poolShareAddress: state.poolShareAddress.trim(),
            dex: state.dex,
            tokenA: state.tokenA.trim(),
            tokenB: state.tokenB.trim(),
            amount: Number(state.amount),
            beneficiary: state.beneficiary.trim() || address!,
            unlockAt: Math.floor(new Date(state.unlockDate).getTime() / 1000),
            metadata: {},
          },
          address!,
          signTransaction,
          setTxPhase,
        )
        lockId = created.id
      }
      addNotification({
        type: "lock_created",
        lockId,
        lockKind: state.lockType,
        title: t("notifications.center.lockCreatedTitle"),
        message: t("notifications.center.lockCreatedMessage", { id: lockId, date: formatDate(unlockAt) }),
      })
      clearState()
      void navigate("/app/locks")
    } catch (err) {
      const structured = sanitizeError(err)
      setError(structured)
    } finally {
      setSubmitting(false)
      setTxPhase("idle")
    }
  }

  const step1Valid = state.lockType === "token" || state.lockType === "lp"
  const step2Valid =
    state.lockType === "token"
      ? isValidStellarContractAddress(state.tokenAddress.trim())
      : isValidStellarContractAddress(state.poolShareAddress.trim()) &&
        isValidStellarContractAddress(state.tokenA.trim()) &&
        isValidStellarContractAddress(state.tokenB.trim())
  const step3Valid = (() => {
    if (state.beneficiary.trim() !== "" && !isValidStellarAddress(state.beneficiary.trim())) {
      return false
    }
    if (state.lockType === "token") {
      const result = validateTokenLockForm({
        tokenAddress: state.tokenAddress,
        amount: state.amount,
        beneficiary: state.beneficiary,
        walletAddress: address ?? null,
        unlockDate: state.unlockDate,
        multiMode: false,
        splitBeneficiaries: [],
      })
      return result.isValid
    } else {
      const result = validateLpLockForm({
        poolShareAddress: state.poolShareAddress,
        tokenA: state.tokenA,
        tokenB: state.tokenB,
        amount: state.amount,
        unlockDate: state.unlockDate,
        walletAddress: address ?? null,
      })
      return result.isValid
    }
  })()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("createLock.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("wizard.subtitle")}</p>
      </div>

      {/* Step Indicator */}
      <div className="mb-8 flex items-center justify-between">
        {[1, 2, 3, 4, 5].map((step) => (
          <div key={step} className="flex flex-1 items-center">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border-2 font-semibold transition-colors",
                currentStep >= step
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              {currentStep > step ? <Check className="h-5 w-5" /> : step}
            </div>
            {step < 5 && (
              <div
                className={cn(
                  "mx-2 h-1 flex-1 rounded transition-colors",
                  currentStep > step ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        ))}
      </div>

      <Card className="p-6">
        {currentStep === 1 && <Step1 state={state} updateState={updateState} t={t} />}
        {currentStep === 2 && <Step2 state={state} updateState={updateState} t={t} />}
        {currentStep === 3 && <Step3 state={state} updateState={updateState} t={t} />}
        {currentStep === 4 && <Step4 state={state} t={t} />}
        {currentStep === 5 && <Step5 txPhase={txPhase} error={error} t={t} />}

        <div className="mt-6 flex gap-3">
          {currentStep > 1 && currentStep < 5 && (
            <Button variant="outline" onClick={goBack} disabled={submitting}>
              <ArrowLeft className="h-4 w-4" />
              {t("wizard.back")}
            </Button>
          )}
          {currentStep < 4 && (
            <Button
              onClick={goNext}
              disabled={
                (currentStep === 1 && !step1Valid) ||
                (currentStep === 2 && !step2Valid) ||
                (currentStep === 3 && !step3Valid)
              }
              className="flex-1"
            >
              {t("wizard.next")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {currentStep === 4 && (
            <Button onClick={() => void handleSubmit()} loading={submitting} className="flex-1">
              {t("wizard.submitLock")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

// Step 1: Select Lock Type
function Step1({
  state,
  updateState,
  t,
}: {
  state: WizardState
  updateState: (updates: Partial<WizardState>) => void
  t: (key: string) => string
}) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{t("wizard.step1.heading")}</h2>
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => updateState({ lockType: "token" })}
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-colors",
            state.lockType === "token" ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
          )}
        >
          <Coins className="h-8 w-8" />
          <span className="font-medium">{t("wizard.step1.tokenLock")}</span>
        </button>
        <button
          type="button"
          onClick={() => updateState({ lockType: "lp" })}
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-colors",
            state.lockType === "lp" ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
          )}
        >
          <Droplets className="h-8 w-8" />
          <span className="font-medium">{t("wizard.step1.lpLock")}</span>
        </button>
      </div>
    </div>
  )
}

// Step 2: Token/Pool Selection
function Step2({
  state,
  updateState,
  t,
}: {
  state: WizardState
  updateState: (updates: Partial<WizardState>) => void
  t: (key: string) => string
}) {
  const { address } = useWallet()
  const validTokenAddress = isValidStellarContractAddress(state.tokenAddress.trim())
    ? state.tokenAddress.trim()
    : undefined
  const { balance: balanceStroops } = useTokenBalanceSWR(validTokenAddress, address ?? null)
  const balance = balanceStroops !== null ? Number(balanceStroops) / 1e7 : null

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">
        {state.lockType === "token" ? t("wizard.step2.selectToken") : t("wizard.step2.selectLiquidityPool")}
      </h2>
      {state.lockType === "token" ? (
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="token">{t("wizard.step2.tokenContractAddress")}</Label>
            <Input
              id="token"
              placeholder="C…"
              value={state.tokenAddress}
              onChange={(e) => updateState({ tokenAddress: e.target.value })}
              className="font-mono"
            />
            {balance !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("wizard.step2.balance")}: {balance.toLocaleString(undefined, { maximumFractionDigits: 7 })}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="dex">{t("wizard.step2.dex")}</Label>
            <select
              id="dex"
              value={state.dex}
              onChange={(e) => updateState({ dex: e.target.value as Dex })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2"
            >
              <option value="aquarius">Aquarius</option>
              <option value="soroswap">Soroswap</option>
            </select>
          </div>
          <div>
            <Label htmlFor="pool">{t("wizard.step2.poolShareContractAddress")}</Label>
            <Input
              id="pool"
              placeholder="C…"
              value={state.poolShareAddress}
              onChange={(e) => updateState({ poolShareAddress: e.target.value })}
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tokenA">{t("wizard.step2.tokenA")}</Label>
              <Input
                id="tokenA"
                placeholder="C…"
                value={state.tokenA}
                onChange={(e) => updateState({ tokenA: e.target.value })}
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="tokenB">{t("wizard.step2.tokenB")}</Label>
              <Input
                id="tokenB"
                placeholder="C…"
                value={state.tokenB}
                onChange={(e) => updateState({ tokenB: e.target.value })}
                className="font-mono"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Step 3: Lock Parameters
function Step3({
  state,
  updateState,
  t,
}: {
  state: WizardState
  updateState: (updates: Partial<WizardState>) => void
  t: (key: string) => string
}) {
  const { address } = useWallet()
  const minDate = new Date(Date.now() + DAY).toISOString().slice(0, 10)

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{t("wizard.step3.heading")}</h2>
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="amount">{t("wizard.step3.amount")}</Label>
          <Input
            id="amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0.00"
            value={state.amount}
            onChange={(e) => updateState({ amount: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="beneficiary">{t("wizard.step3.beneficiary")}</Label>
          <Input
            id="beneficiary"
            placeholder={address ?? "G…"}
            value={state.beneficiary}
            onChange={(e) => updateState({ beneficiary: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t("wizard.step3.beneficiaryHint")}</p>
        </div>
        <div>
          <Label htmlFor="unlockDate">{t("wizard.step3.unlockDate")}</Label>
          <Input
            id="unlockDate"
            type="date"
            min={minDate}
            value={state.unlockDate}
            onChange={(e) => updateState({ unlockDate: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.vesting}
            onChange={(e) => updateState({ vesting: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm">{t("wizard.step3.enableVesting")}</span>
        </label>
      </div>
    </div>
  )
}

// Step 4: Review & Confirm
function Step4({ state, t }: { state: WizardState; t: (key: string) => string }) {
  const { address } = useWallet()
  const effectiveBeneficiary = state.beneficiary.trim() || address || ""

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{t("wizard.step4.heading")}</h2>
      <div className="flex flex-col gap-3 rounded-lg bg-secondary/30 p-4">
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">{t("wizard.step4.lockType")}:</span>
          <span className="font-medium">
            {state.lockType === "token" ? t("wizard.step1.tokenLock") : t("wizard.step1.lpLock")}
          </span>
        </div>
        {state.lockType === "token" ? (
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">{t("wizard.step4.token")}:</span>
            <span className="font-mono text-sm">{state.tokenAddress.substring(0, 8)}…</span>
          </div>
        ) : (
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">{t("wizard.step4.pool")}:</span>
            <span className="font-mono text-sm">{state.poolShareAddress.substring(0, 8)}…</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">{t("wizard.step4.amount")}:</span>
          <span className="font-medium">{state.amount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">{t("wizard.step4.beneficiary")}:</span>
          <span className="font-mono text-sm" title={effectiveBeneficiary}>
            {effectiveBeneficiary ? `${effectiveBeneficiary.substring(0, 8)}…` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">{t("wizard.step4.unlockDate")}:</span>
          <span className="font-medium">{new Date(state.unlockDate).toLocaleDateString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">{t("wizard.step4.vesting")}:</span>
          <span className="font-medium">
            {state.vesting ? t("wizard.step4.enabled") : t("wizard.step4.disabled")}
          </span>
        </div>
      </div>
    </div>
  )
}

// Step 5: Transaction Progress
function Step5({
  txPhase,
  error,
  t,
}: {
  txPhase: TxPhase | "idle"
  error: StructuredError | null
  t: (key: string) => string
}) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{t("wizard.step5.heading")}</h2>
      {txPhase !== "idle" && <TxProgressSteps phase={txPhase} />}
      {error && <TxErrorAlert error={error} />}
      {txPhase === "idle" && !error && (
        <p className="text-sm text-muted-foreground">{t("wizard.step5.hint")}</p>
      )}
    </div>
  )
}
