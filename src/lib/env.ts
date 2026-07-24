/**
 * Runtime environment variable validation.
 * Throws at app startup if any required var is missing or invalid.
 */

const REQUIRED = [
  "VITE_NETWORK",
  "VITE_RPC_URL",
  "VITE_HORIZON_URL",
  "VITE_TOKEN_LOCKER_CONTRACT",
  "VITE_LP_LOCKER_CONTRACT",
] as const

function validate(): void {
  const missing = REQUIRED.filter((key) => !(import.meta.env[key] as string | undefined)?.trim())

  if (missing.length > 0) {
    throw new Error(
      `[StellarLock] Missing required environment variables:\n` +
        missing.map((k) => `  • ${k}`).join("\n") +
        `\n\nCopy the appropriate template and fill in the values:\n` +
        `  cp .env.testnet .env   # testnet\n` +
        `  cp .env.staging .env   # staging\n` +
        `  cp .env.mainnet .env   # mainnet`,
    )
  }
}

validate()

type Network = "testnet" | "staging" | "mainnet"

const raw = (import.meta.env.VITE_NETWORK as string).toLowerCase()

export const ENV = {
  network: raw as Network,
  rpcUrl: import.meta.env.VITE_RPC_URL as string,
  horizonUrl: import.meta.env.VITE_HORIZON_URL as string,
  tokenLockerContract: import.meta.env.VITE_TOKEN_LOCKER_CONTRACT as string,
  lpLockerContract: import.meta.env.VITE_LP_LOCKER_CONTRACT as string,
  appUrl: (import.meta.env.VITE_APP_URL as string | undefined) ?? "",
  /** True only in the browser dev server (import.meta.env.DEV) */
  isDev: import.meta.env.DEV,
  /** Show the environment badge in dev and staging builds */
  showEnvBadge: import.meta.env.DEV || raw === "staging",
}
