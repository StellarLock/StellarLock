type Metric = {
  name: string
  value: number
  rating: "good" | "needs-improvement" | "poor"
  delta: number
  id: string
  navigationType: string
}

const BUDGETS = {
  LCP: 2500,
  CLS: 0.1,
  INP: 200,
  FID: 100,
  TTFB: 600,
}

function logBudgetViolation(name: string, value: number, budget: number): void {
  if (import.meta.env.DEV) {
    log.warn("Performance budget exceeded", { name, value, budget })
  }
}

function reportWebVital(metric: Metric): void {
  const budget = BUDGETS[metric.name as keyof typeof BUDGETS]

  if (budget && metric.value > budget) {
    logBudgetViolation(metric.name, metric.value, budget)
  }

  try {
    const w = window as unknown as {
      plausible?: (name: string, opts?: { props: Record<string, string | number> }) => void
    }
    if (w.plausible) {
      w.plausible(`web_vitals_${metric.name.toLowerCase()}`, {
        props: {
          value: Math.round(metric.value),
          rating: metric.rating,
        },
      })
    }
  } catch {
    // Silently ignore analytics failures
  }
}

export async function initWebVitals(): Promise<void> {
  try {
    const { getCLS, getFID, getFCP, getLCP, getTTFB, getINP } = await import(
      "web-vitals"
    )

    getCLS(reportWebVital)
    getFID?.(reportWebVital)
    getFCP(reportWebVital)
    getLCP(reportWebVital)
    getTTFB(reportWebVital)
    getINP?.(reportWebVital)
  } catch {
    // web-vitals not available
  }
}
