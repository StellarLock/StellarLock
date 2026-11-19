import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { useModalFocusTrap } from "@/lib/modalFocusTrap"
import { X } from "lucide-react"

interface Props {
  open: boolean
  onClose: () => void
}

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
const mod = isMac ? "⌘" : "Ctrl"

const SHORTCUTS = [
  { keys: [mod, "K"], actionKey: "keyboardShortcuts.actions.openSearch" },
  { keys: [mod, "N"], actionKey: "keyboardShortcuts.actions.navigateCreateLock" },
  { keys: [mod, "L"], actionKey: "keyboardShortcuts.actions.navigateMyLocks" },
  { keys: [mod, "E"], actionKey: "keyboardShortcuts.actions.navigateExplorer" },
  { keys: ["Esc"], actionKey: "keyboardShortcuts.actions.closeModals" },
  { keys: ["?"], actionKey: "keyboardShortcuts.actions.showHelp" },
]

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)

  useModalFocusTrap({ active: open, containerRef, onEscape: onClose })

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("keyboardShortcuts.title")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={containerRef} className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("keyboardShortcuts.title")}</h2>
          <button
            onClick={onClose}
            aria-label={t("keyboardShortcuts.closeAria")}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="flex flex-col gap-3">
          {SHORTCUTS.map(({ keys, actionKey }) => (
            <li key={actionKey} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{t(actionKey)}</span>
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
