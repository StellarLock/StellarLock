function isDevelopment(): boolean {
  return !import.meta.env.PROD
}

function getSentryDSN(): string | undefined {
  return import.meta.env.VITE_SENTRY_DSN
}

function initSentry(): void {
  if (isDevelopment() || !getSentryDSN()) {
    return
  }

  const script = document.createElement("script")
  script.src = "https://browser.sentry-cdn.com/7.80.0/bundle.min.js"
  script.integrity =
    "sha384-DDlbyraQegZ1j3VPrD5tJlHXbXK3ornVnW23Jmp0VqfnlAcsWNFjlMeJ8o8zdiZD"
  script.crossOrigin = "anonymous"

  script.onload = () => {
    const Sentry = (window as any).Sentry
    if (Sentry) {
      Sentry.init({
        dsn: getSentryDSN(),
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
        integrations: [
          new Sentry.Replay({
            maskAllText: true,
            blockAllMedia: true,
          }),
        ],
      })
    }
  }

  document.head.appendChild(script)
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (isDevelopment()) {
    log.error("Sentry error", { error, context })
    return
  }

  const Sentry = (window as any).Sentry
  if (Sentry) {
    if (context) {
      Sentry.captureException(error, { contexts: { custom: context } })
    } else {
      Sentry.captureException(error)
    }
  }
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
  if (isDevelopment()) {
    log.info(`Sentry ${level}: ${message}`)
    return
  }

  const Sentry = (window as any).Sentry
  if (Sentry) {
    Sentry.captureMessage(message, level)
  }
}

export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>,
): void {
  const Sentry = (window as any).Sentry
  if (Sentry) {
    Sentry.addBreadcrumb({
      message,
      category,
      data,
      timestamp: Date.now() / 1000,
    })
  }
}

export function setUserContext(walletAddress?: string): void {
  const Sentry = (window as any).Sentry
  if (Sentry) {
    if (walletAddress) {
      const hash = new TextEncoder().encode(walletAddress)
      const hashArray = Array.from(new Uint8Array(hash))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
      Sentry.setUser({ id: hashHex })
    } else {
      Sentry.setUser(null)
    }
  }
}

export function initErrorTracking(): void {
  initSentry()
}
