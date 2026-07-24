import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

interface Options {
  onShowHelp: () => void
}

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "CONTENTEDITABLE"])

function isTypingInInput(): boolean {
  const el = document.activeElement
  if (!el) return false
  if (INPUT_TAGS.has(el.tagName)) return true
  if (el.getAttribute("contenteditable") === "true") return true
  return false
}

export function useKeyboardShortcuts({ onShowHelp }: Options) {
  const navigate = useNavigate()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // ? — show help (allowed even in inputs for discoverability? No — respect focus)
      if (event.key === "?" && !isTypingInInput()) {
        event.preventDefault()
        onShowHelp()
        return
      }

      // Escape is handled per-modal; nothing global needed here

      if (isTypingInInput()) return

      const mod = event.ctrlKey || event.metaKey

      if (mod) {
        switch (event.key.toLowerCase()) {
          case "k":
            event.preventDefault()
            void navigate("/explore")
            break
          case "n":
            event.preventDefault()
            void navigate("/app/create")
            break
          case "l":
            event.preventDefault()
            void navigate("/app/locks")
            break
          case "e":
            event.preventDefault()
            void navigate("/explore")
            break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [navigate, onShowHelp])
}
