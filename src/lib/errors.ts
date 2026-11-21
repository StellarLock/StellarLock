import { NETWORK } from "@/lib/stellar"

// The two StellarLock contracts assign different numbers to the same-named
// error variant (e.g. CanOnlyExtend is #6 on token-locker but #5 on
// lp-locker), so a numeric-only RPC error like "Error(Contract, #5)" can only
// be resolved correctly once the caller says which contract it came from.
export type ContractKind = "token-locker" | "lp-locker"

// Mirrors contracts/token-locker/src/lib.rs's `ContractError` enum.
const TOKEN_LOCKER_ERROR_CODES: Record<number, string> = {
  1: "AmountMustBePositive",
  2: "UnlockMustBeFuture",
  3: "AlreadyWithdrawn",
  4: "StillLocked",
  5: "NothingToRelease",
  6: "CanOnlyExtend",
  7: "VestingEndBeforeStart",
  8: "TooFewBeneficiaries",
  9: "TooManyBeneficiaries",
  10: "SharesMustSum10000",
  11: "RateLimitExceeded",
  12: "AmountOverflow",
  13: "NoPendingAdmin",
  14: "NotPendingAdmin",
  15: "NotAdmin",
  16: "NotInitialized",
  19: "ReentrancyDetected",
  20: "LockNotFound",
  21: "ContractPaused",
  22: "ExtensionLimitExceeded",
  23: "LockDurationTooShort",
  24: "LockDurationTooLong",
}

// Mirrors contracts/lp-locker/src/lib.rs's `ContractError` enum — note several
// codes differ from token-locker's above even though the variant names match.
const LP_LOCKER_ERROR_CODES: Record<number, string> = {
  1: "AmountMustBePositive",
  2: "UnlockMustBeFuture",
  3: "AlreadyWithdrawn",
  4: "StillLocked",
  5: "CanOnlyExtend",
  7: "NoPendingAdmin",
  8: "NotPendingAdmin",
  9: "ReentrancyDetected",
  10: "AmountOverflow",
  11: "LockNotFound",
  12: "TooFewBeneficiaries",
  13: "TooManyBeneficiaries",
  14: "SharesMustSum10000",
  15: "VestingEndBeforeStart",
  16: "NothingToRelease",
  17: "RateLimitExceeded",
  20: "IdenticalTokens",
  21: "ContractPaused",
  22: "ExtensionLimitExceeded",
  23: "LockDurationTooShort",
  24: "LockDurationTooLong",
  25: "NotInitialized",
}

const CONTRACT_ERROR_CODES_BY_KIND: Record<ContractKind, Record<number, string>> = {
  "token-locker": TOKEN_LOCKER_ERROR_CODES,
  "lp-locker": LP_LOCKER_ERROR_CODES,
}

export interface StructuredError {
  code: string
  title: string
  message: string
  recovery: string | null
  link: { label: string; url: string } | null
  i18nKey: string
}

// Map Soroban contract error codes → structured errors.
// Every variant in the Rust ContractError enum must have a corresponding entry
// here so users see a meaningful message instead of the generic fallback.
const CONTRACT_ERRORS: Record<string, Omit<StructuredError, "code">> = {
  AmountMustBePositive: {
    title: "errors.amountMustBePositive.title",
    message: "errors.amountMustBePositive.message",
    recovery: "errors.amountMustBePositive.recovery",
    link: null,
    i18nKey: "errors.amountMustBePositive",
  },
  UnlockMustBeFuture: {
    title: "errors.unlockMustBeFuture.title",
    message: "errors.unlockMustBeFuture.message",
    recovery: "errors.unlockMustBeFuture.recovery",
    link: null,
    i18nKey: "errors.unlockMustBeFuture",
  },
  StillLocked: {
    title: "errors.stillLocked.title",
    message: "errors.stillLocked.message",
    recovery: "errors.stillLocked.recovery",
    link: null,
    i18nKey: "errors.stillLocked",
  },
  AlreadyWithdrawn: {
    title: "errors.alreadyWithdrawn.title",
    message: "errors.alreadyWithdrawn.message",
    recovery: null,
    link: null,
    i18nKey: "errors.alreadyWithdrawn",
  },
  NothingToRelease: {
    title: "errors.nothingToRelease.title",
    message: "errors.nothingToRelease.message",
    recovery: "errors.nothingToRelease.recovery",
    link: null,
    i18nKey: "errors.nothingToRelease",
  },
  CanOnlyExtend: {
    title: "errors.canOnlyExtend.title",
    message: "errors.canOnlyExtend.message",
    recovery: "errors.canOnlyExtend.recovery",
    link: null,
    i18nKey: "errors.canOnlyExtend",
  },
  LockDurationTooLong: {
    title: "errors.lockDurationTooLong.title",
    message: "errors.lockDurationTooLong.message",
    recovery: "errors.lockDurationTooLong.recovery",
    link: null,
    i18nKey: "errors.lockDurationTooLong",
  },
  VestingEndBeforeStart: {
    title: "errors.vestingEndBeforeStart.title",
    message: "errors.vestingEndBeforeStart.message",
    recovery: "errors.vestingEndBeforeStart.recovery",
    link: null,
    i18nKey: "errors.vestingEndBeforeStart",
  },
  TooFewBeneficiaries: {
    title: "errors.tooFewBeneficiaries.title",
    message: "errors.tooFewBeneficiaries.message",
    recovery: "errors.tooFewBeneficiaries.recovery",
    link: null,
    i18nKey: "errors.tooFewBeneficiaries",
  },
  TooManyBeneficiaries: {
    title: "errors.tooManyBeneficiaries.title",
    message: "errors.tooManyBeneficiaries.message",
    recovery: "errors.tooManyBeneficiaries.recovery",
    link: null,
    i18nKey: "errors.tooManyBeneficiaries",
  },
  SharesMustSum10000: {
    title: "errors.sharesMustSum10000.title",
    message: "errors.sharesMustSum10000.message",
    recovery: "errors.sharesMustSum10000.recovery",
    link: null,
    i18nKey: "errors.sharesMustSum10000",
  },
  RateLimitExceeded: {
    title: "errors.rateLimitExceeded.title",
    message: "errors.rateLimitExceeded.message",
    recovery: "errors.rateLimitExceeded.recovery",
    link: null,
    i18nKey: "errors.rateLimitExceeded",
  },
  LockDurationTooShort: {
    title: "errors.lockDurationTooShort.title",
    message: "errors.lockDurationTooShort.message",
    recovery: "errors.lockDurationTooShort.recovery",
    link: null,
    i18nKey: "errors.lockDurationTooShort",
  },
  ExtensionLimitExceeded: {
    title: "errors.extensionLimitExceeded.title",
    message: "errors.extensionLimitExceeded.message",
    recovery: "errors.extensionLimitExceeded.recovery",
    link: null,
    i18nKey: "errors.extensionLimitExceeded",
  },
  // --- Previously missing contract error variants, now mapped ---
  AmountOverflow: {
    title: "errors.amountOverflow.title",
    message: "errors.amountOverflow.message",
    recovery: "errors.amountOverflow.recovery",
    link: null,
    i18nKey: "errors.amountOverflow",
  },
  NotAdmin: {
    title: "errors.notAdmin.title",
    message: "errors.notAdmin.message",
    recovery: "errors.notAdmin.recovery",
    link: null,
    i18nKey: "errors.notAdmin",
  },
  NoPendingAdmin: {
    title: "errors.noPendingAdmin.title",
    message: "errors.noPendingAdmin.message",
    recovery: "errors.noPendingAdmin.recovery",
    link: null,
    i18nKey: "errors.noPendingAdmin",
  },
  NotPendingAdmin: {
    title: "errors.notPendingAdmin.title",
    message: "errors.notPendingAdmin.message",
    recovery: "errors.notPendingAdmin.recovery",
    link: null,
    i18nKey: "errors.notPendingAdmin",
  },
  ReentrancyDetected: {
    title: "errors.reentrancyDetected.title",
    message: "errors.reentrancyDetected.message",
    recovery: "errors.reentrancyDetected.recovery",
    link: null,
    i18nKey: "errors.reentrancyDetected",
  },
  // --- LP-locker specific ---
  IdenticalTokens: {
    title: "errors.identicalTokens.title",
    message: "errors.identicalTokens.message",
    recovery: "errors.identicalTokens.recovery",
    link: null,
    i18nKey: "errors.identicalTokens",
  },
  NotInitialized: {
    title: "errors.notInitialized.title",
    message: "errors.notInitialized.message",
    recovery: "errors.notInitialized.recovery",
    link: null,
    i18nKey: "errors.notInitialized",
  },
  LockNotFound: {
    title: "errors.lockNotFound.title",
    message: "errors.lockNotFound.message",
    recovery: "errors.lockNotFound.recovery",
    link: null,
    i18nKey: "errors.lockNotFound",
  },
  ContractPaused: {
    title: "errors.contractPaused.title",
    message: "errors.contractPaused.message",
    recovery: "errors.contractPaused.recovery",
    link: null,
    i18nKey: "errors.contractPaused",
  },
}

// Map wallet/network errors
function parseWalletError(err: unknown): StructuredError | null {
  const msg = String((err as Error)?.message ?? "").toLowerCase()

  if (msg.includes("user rejected") || msg.includes("user denied")) {
    return {
      code: "USER_REJECTED",
      i18nKey: "errors.userRejected",
      title: "errors.userRejected.title",
      message: "errors.userRejected.message",
      recovery: "errors.userRejected.recovery",
      link: null,
    }
  }
  if (msg.includes("insufficient balance") || msg.includes("underfunded")) {
    return {
      code: "INSUFFICIENT_BALANCE",
      i18nKey: "errors.insufficientBalance",
      title: "errors.insufficientBalance.title",
      message: "errors.insufficientBalance.message",
      recovery: "errors.insufficientBalance.recovery",
      link: null,
    }
  }
  if (msg.includes("wrong network") || msg.includes("network mismatch")) {
    return {
      code: "WRONG_NETWORK",
      i18nKey: "errors.wrongNetwork",
      title: "errors.wrongNetwork.title",
      message: "errors.wrongNetwork.message",
      recovery: "errors.wrongNetwork.recovery",
      link: null,
    }
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return {
      code: "TIMEOUT",
      i18nKey: "errors.timeout",
      title: "errors.timeout.title",
      message: "errors.timeout.message",
      recovery: "errors.timeout.recovery",
      link: { label: "Check on Stellar Expert", url: `https://stellar.expert/explorer/${NETWORK.networkName}` },
    }
  }
  return null
}

export function parseError(err: unknown, contractKind?: ContractKind): StructuredError {
  // Try wallet-level errors first
  const walletErr = parseWalletError(err)
  if (walletErr) return walletErr

  const raw = String((err as { message?: string })?.message ?? "")

  // 1. Symbolic contract error, e.g. "Error(Contract, #1): AmountMustBePositive".
  const symbolicMatch = raw.match(/Error\(Contract,\s*#\d+\)\s*:\s*([A-Za-z]+)/)
  let code: string | undefined = symbolicMatch?.[1]

  // 2. Numeric-only contract error, e.g. "Error(Contract, #4)" — this is what
  // real RPC simulation/submission failures usually look like (issue #1066).
  // The same number means different variants on different contracts, so this
  // only resolves when the caller tells us which contract raised it.
  if (!code) {
    const numericMatch = raw.match(/Error\(Contract,\s*#(\d+)\)/)
    if (numericMatch && contractKind) {
      code = CONTRACT_ERROR_CODES_BY_KIND[contractKind][Number(numericMatch[1])]
    }
  }

  // 3. Fallback: grab a bare capitalized identifier (e.g. "HostError"). This
  // essentially never matches a real key in CONTRACT_ERRORS, but it's kept so
  // behavior is unchanged for messages the two cases above don't recognize.
  if (!code) {
    code = raw.match(/([A-Z][a-zA-Z]+Error|[A-Z][a-zA-Z]+)/)?.[1]
  }

  code = code ?? "UNKNOWN"

  if (code in CONTRACT_ERRORS) {
    return { code, ...CONTRACT_ERRORS[code] }
  }

  // Generic fallback
  // IMPORTANT: do not return raw error text to the UI.
  return {
    code: "UNKNOWN",
    i18nKey: "errors.unknown",
    title: "errors.unknown.title",
    message: "errors.unknown.message",
    recovery: "errors.unknown.recovery",
    link: null,
  }
}
