export interface StructuredError {
  code:     string;
  title:    string;
  message:  string;
  recovery: string | null;
  link:     { label: string; url: string } | null;
  i18nKey:  string;
}

// Map Soroban contract error codes → structured errors
const CONTRACT_ERRORS: Record<string, Omit<StructuredError, 'code'>> = {
  AmountMustBePositive: {
    title:    'errors.amountMustBePositive.title',
    message:  'errors.amountMustBePositive.message',
    recovery: 'errors.amountMustBePositive.recovery',
    link:     null,
    i18nKey:  'errors.amountMustBePositive',
  },
  UnlockMustBeFuture: {
    title:    'errors.unlockMustBeFuture.title',
    message:  'errors.unlockMustBeFuture.message',
    recovery: 'errors.unlockMustBeFuture.recovery',
    link:     null,
    i18nKey:  'errors.unlockMustBeFuture',
  },
  StillLocked: {
    title:    'errors.stillLocked.title',
    message:  'errors.stillLocked.message',
    recovery: 'errors.stillLocked.recovery',
    link:     null,
    i18nKey:  'errors.stillLocked',
  },
  AlreadyWithdrawn: {
    title:    'errors.alreadyWithdrawn.title',
    message:  'errors.alreadyWithdrawn.message',
    recovery: null,
    link:     null,
    i18nKey:  'errors.alreadyWithdrawn',
  },
  CanOnlyExtend: {
    title:    'errors.canOnlyExtend.title',
    message:  'errors.canOnlyExtend.message',
    recovery: 'errors.canOnlyExtend.recovery',
    link:     null,
    i18nKey:  'errors.canOnlyExtend',
  },
  LockDurationTooLong: {
    title:    'errors.lockDurationTooLong.title',
    message:  'errors.lockDurationTooLong.message',
    recovery: 'errors.lockDurationTooLong.recovery',
    link:     null,
    i18nKey:  'errors.lockDurationTooLong',
  },
};

// Map wallet/network errors
function parseWalletError(err: unknown): StructuredError | null {
  const msg = String((err as Error)?.message ?? '').toLowerCase();

  if (msg.includes('user rejected') || msg.includes('user denied')) {
    return {
      code: 'USER_REJECTED', i18nKey: 'errors.userRejected',
      title: 'errors.userRejected.title', message: 'errors.userRejected.message',
      recovery: 'errors.userRejected.recovery', link: null,
    };
  }
  if (msg.includes('insufficient balance') || msg.includes('underfunded')) {
    return {
      code: 'INSUFFICIENT_BALANCE', i18nKey: 'errors.insufficientBalance',
      title: 'errors.insufficientBalance.title', message: 'errors.insufficientBalance.message',
      recovery: 'errors.insufficientBalance.recovery', link: null,
    };
  }
  if (msg.includes('wrong network') || msg.includes('network mismatch')) {
    return {
      code: 'WRONG_NETWORK', i18nKey: 'errors.wrongNetwork',
      title: 'errors.wrongNetwork.title', message: 'errors.wrongNetwork.message',
      recovery: 'errors.wrongNetwork.recovery', link: null,
    };
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return {
      code: 'TIMEOUT', i18nKey: 'errors.timeout',
      title: 'errors.timeout.title', message: 'errors.timeout.message',
      recovery: 'errors.timeout.recovery',
      link: { label: 'Check on Stellar Expert', url: 'https://stellar.expert/explorer/testnet' },
    };
  }
  return null;
}

export function parseError(err: unknown): StructuredError {
  // Try wallet-level errors first
  const walletErr = parseWalletError(err);
  if (walletErr) return walletErr;

  // Try to extract Soroban contract error code
  const raw = String((err as { message?: string })?.message ?? '');
  const match = raw.match(/Error\(Contract,\s*#(\d+)\)|([A-Z][a-zA-Z]+Error|[A-Z][a-zA-Z]+)/);
  const code = match?.[2] ?? match?.[1] ?? 'UNKNOWN';

  if (code in CONTRACT_ERRORS) {
    return { code, ...CONTRACT_ERRORS[code] };
  }

  // Generic fallback
  return {
    code: 'UNKNOWN', i18nKey: 'errors.unknown',
    title: 'errors.unknown.title', message: raw || 'errors.unknown.message',
    recovery: 'errors.unknown.recovery', link: null,
  };
}