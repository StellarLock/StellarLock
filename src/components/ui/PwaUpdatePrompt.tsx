import { useEffect, useState } from "react"
import { Button } from "@/components/ui/Button"

export function PwaUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    navigator.serviceWorker.ready.then((registration) => {
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker)
          }
        })
      })
    })

    // Detect controller change (after skipWaiting) and reload
    let refreshing = false
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    })
  }, [])

  if (!waitingWorker) return null

  function applyUpdate() {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" })
  }

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg"
    >
      <p className="text-sm font-medium">A new version is available.</p>
      <Button size="sm" onClick={applyUpdate}>
        Update
      </Button>
    </div>
  )
}
