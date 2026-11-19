/**
 * Translate raw wallet-connection error messages into user-facing copy.
 * Kept separate from WalletProvider so the mappings can be unit-tested.
 */

export function getFriendlyError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes("cancel") || normalized.includes("rejected"))
    return "Connection was rejected. Please approve the prompt in Freighter."
  if (normalized.includes("network"))
    return "The wallet is on the wrong network. Switch Freighter to the app network and try again."
  if (normalized.includes("freighter") || normalized.includes("extension"))
    return "Freighter was not detected. Install or unlock the extension and retry."
  return message
}

export function getConnectHelp(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes("cancel") || normalized.includes("rejected"))
    return "Approve the connection popup in Freighter to continue."
  if (normalized.includes("network")) return "Switch Freighter to Testnet or Mainnet to match the app and try again."
  if (normalized.includes("freighter") || normalized.includes("extension"))
    return "Install the Freighter extension or unlock it, then try again."
  return "Check your browser extension and network connection, then retry."
}
