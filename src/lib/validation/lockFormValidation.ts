import { isValidStellarAddress, isValidStellarContractAddress } from "@/lib/stellar"
import type { SplitBeneficiary } from "@/lib/split-lock"


export type FieldKey =
  | "tokenAddress"
  | "amount"
  | "beneficiary"
  | "unlockDate"
  | "splitBeneficiaries"
  | "poolShareAddress"
  | "tokenA"
  | "tokenB"

export interface FieldValidationIssue {
  field: FieldKey
  message: string
  guidance?: string
}

export interface LockFormValidationResult {
  isValid: boolean
  issues: FieldValidationIssue[]
}

function mustBeFuture(unlockAtMs: number): boolean {
  return unlockAtMs > Date.now()
}

function parseAmount(amount: string): number | null {
  const n = Number(amount)
  if (!Number.isFinite(n)) return null
  return n
}

export function validateTokenLockForm(params: {
  tokenAddress: string
  amount: string
  beneficiary: string
  walletAddress: string | null
  unlockDate: string
  multiMode: boolean
  splitBeneficiaries: SplitBeneficiary[]
  allowance?: number | null
}): LockFormValidationResult {
  const issues: FieldValidationIssue[] = []

  const tokenAddressTrimmed = params.tokenAddress.trim()
  const beneficiaryTrimmed = params.beneficiary.trim()
  const effectiveBeneficiary = beneficiaryTrimmed || params.walletAddress || ""

  const tokenAddressValid = isValidStellarContractAddress(tokenAddressTrimmed)
  if (!tokenAddressValid) {
    issues.push({
      field: "tokenAddress",
      message: "Invalid token contract address.",
      guidance: "Paste a Stellar contract id (starts with C) for the token you want to lock.",
    })
  }

  const amountParsed = parseAmount(params.amount)
  if (amountParsed == null || amountParsed <= 0) {
    issues.push({
      field: "amount",
      message: "Amount must be greater than 0.",
      guidance: "Enter a positive number of tokens to lock.",
    })
  }

  const beneficiaryValid = isValidStellarAddress(effectiveBeneficiary)
  if (!beneficiaryValid) {
    issues.push({
      field: "beneficiary",
      message: "Invalid beneficiary address.",
      guidance: "Enter a valid Stellar account (G…) or contract id.",
    })
  }

  const unlockAtMs = params.unlockDate ? new Date(params.unlockDate).getTime() : 0
  if (!params.unlockDate || !Number.isFinite(unlockAtMs) || !mustBeFuture(unlockAtMs)) {
    issues.push({
      field: "unlockDate",
      message: "Unlock date must be in the future.",
      guidance: "Choose a date after today (the unlock date cannot be in the past).",
    })
  }

  if (params.multiMode) {
    const split = params.splitBeneficiaries
    const minCountOk = split.length >= 2
    const allValid = split.every((b) => isValidStellarAddress(b.address))
    const sumBps = split.reduce((s, b) => s + (Number(b.shareBps) || 0), 0)

    if (!minCountOk) {
      issues.push({
        field: "splitBeneficiaries",
        message: "Split mode requires at least 2 beneficiaries.",
        guidance: "Add more beneficiary rows until there are at least 2 entries.",
      })
    }

    if (!allValid) {
      issues.push({
        field: "splitBeneficiaries",
        message: "One or more beneficiary addresses are invalid.",
        guidance: "Fix the addresses in each split beneficiary row.",
      })
    }

    if (minCountOk && allValid && sumBps !== 10_000) {
      issues.push({
        field: "splitBeneficiaries",
        message: "Split shares must sum to 10,000 (100%).",
        guidance: "Adjust the basis-point shares so the total equals exactly 10,000.",
      })
    }
  }

  const allowance = params.allowance
  if (allowance != null && amountParsed != null && allowance < amountParsed) {
    issues.push({
      field: "amount",
      message: "Token allowance is too low.",
      guidance: "Approve the token (one-time per token) and then lock again.",
    })
  }

  return { isValid: issues.length === 0, issues }
}

export function validateLpLockForm(params: {
  poolShareAddress: string
  tokenA: string
  tokenB: string
  amount: string
  unlockDate: string
  walletAddress: string | null
  allowance?: number | null
}): LockFormValidationResult {
  const issues: FieldValidationIssue[] = []

  const poolShareTrimmed = params.poolShareAddress.trim()
  const tokenATrimmed = params.tokenA.trim()
  const tokenBTrimmed = params.tokenB.trim()
  const wallet = params.walletAddress || ""

  const poolShareValid = isValidStellarContractAddress(poolShareTrimmed)
  if (!poolShareValid) {
    issues.push({
      field: "poolShareAddress",
      message: "Invalid pool share contract address.",
      guidance: "Paste the pool share contract id (starts with C) from the DEX.",
    })
  }

  const tokenAValid = isValidStellarContractAddress(tokenATrimmed)
  if (!tokenAValid) {
    issues.push({
      field: "tokenA",
      message: "Invalid token A contract address.",
      guidance: "Paste a Stellar token contract id (starts with C).",
    })
  }

  const tokenBValid = isValidStellarContractAddress(tokenBTrimmed)
  if (!tokenBValid) {
    issues.push({
      field: "tokenB",
      message: "Invalid token B contract address.",
      guidance: "Paste a Stellar token contract id (starts with C).",
    })
  }

  const beneficiaryValid = isValidStellarAddress(wallet)
  if (!beneficiaryValid) {
    issues.push({
      field: "beneficiary",
      message: "Wallet beneficiary address is invalid.",
      guidance: "Connect your wallet again.",
    })
  }

  const amountParsed = parseAmount(params.amount)
  if (amountParsed == null || amountParsed <= 0) {
    issues.push({
      field: "amount",
      message: "Amount must be greater than 0.",
      guidance: "Enter a positive number of pool share tokens to lock.",
    })
  }

  const unlockAtMs = params.unlockDate ? new Date(params.unlockDate).getTime() : 0
  if (!params.unlockDate || !Number.isFinite(unlockAtMs) || !mustBeFuture(unlockAtMs)) {
    issues.push({
      field: "unlockDate",
      message: "Unlock date must be in the future.",
      guidance: "Choose a date after today.",
    })
  }

  const allowance = params.allowance
  if (allowance != null && amountParsed != null && allowance < amountParsed) {
    issues.push({
      field: "amount",
      message: "Token allowance is too low.",
      guidance: "Approve the pool-share token (one-time per token) and then lock again.",
    })
  }

  return { isValid: issues.length === 0, issues }
}

