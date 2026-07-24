type EventName =
  | "pageview"
  | "wallet_connect"
  | "wallet_disconnect"
  | "lock_create_token"
  | "lock_create_lp"
  | "lock_create_split"
  | "lock_withdraw"
  | "lock_extend"
  | "lock_transfer_beneficiary"
  | "explorer_search"
  | "token_approve"

type EventProps = Record<string, string | number | boolean>

function getPlausibleDomain(): string | undefined {
  return import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined
}

function getPlausibleApiHost(): string {
  return (import.meta.env.VITE_PLAUSIBLE_API_HOST as string | undefined) || "https://plausible.io"
}

export function initAnalytics(): void {
  const domain = getPlausibleDomain()
  if (!domain) return

  const script = document.createElement("script")
  script.defer = true
  script.crossOrigin = "anonymous"
  script.integrity = (import.meta.env.VITE_PLAUSIBLE_INTEGRITY as string | undefined) || ""
  script.dataset.domain = domain
  script.dataset.api = `${getPlausibleApiHost()}/api/event`
  script.src = `${getPlausibleApiHost()}/js/script.js`
  document.head.appendChild(script)
}

export function trackEvent(name: EventName, props?: EventProps): void {
  const domain = getPlausibleDomain()
  if (!domain) return

  try {
    const w = window as unknown as { plausible?: (name: string, opts?: { props: EventProps }) => void }
    if (w.plausible) {
      w.plausible(name, props ? { props } : undefined)
    }
  } catch {
    // Silently ignore analytics failures
  }
}

export function trackPageView(): void {
  trackEvent("pageview")
}
