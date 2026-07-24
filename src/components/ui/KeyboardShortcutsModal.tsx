import { useEffect } from "react"
import { X } from "lucide-react"

interface Props {
  open: boolean
  onClose: () => void
}

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
const mod = isMac ? "⌘" : "Ctrl"

const SHORTCUTS = [
  { keys: [mod, "K"], action: "Open quick search / Explorer" },
  { keys: [mod, "N"], action: "Navigate to Create Lock" },
  { keys: [mod, "L"], action: "Navigate to My Locks" },
  { keys: [mod, "E"], action: "Navigate to Explorer" },
  { keys: ["Esc"], action: "Close modals / dialogs" },
  { keys: ["?"], action: "Show this help" },
]

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="flex flex-col gap-3">
          {SHORTCUTS.map(({ keys, action }) => (
            <li key={action} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{action}</span>
              <span className="flex items-center gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
