import { useEffect, useMemo, useRef } from "react"
import React from "react"

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
    "[role='button']",
    "[contenteditable='true']",
  ].join(",")

  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    const style = window.getComputedStyle(el)
    return style.visibility !== "hidden" && style.display !== "none" && !el.hasAttribute("disabled")
  })
}

export function useModalFocusTrap({
  active,
  containerRef,
  initialFocusRef,
  onEscape,
}: {
  active: boolean
  containerRef: React.RefObject<HTMLElement>
  initialFocusRef?: React.RefObject<HTMLElement>
  onEscape?: () => void
}) {
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  // Touch React types so TS knows we depend on them.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _keepMemo = useMemo(() => true, [])

  useEffect(() => {
    if (!active) return

    const container = containerRef.current
    if (!container) return

    lastFocusedRef.current = document.activeElement as HTMLElement | null

    const focusable = initialFocusRef?.current ?? getFocusableElements(container)[0]
    focusable?.focus?.()

    function onKeyDown(e: KeyboardEvent) {
      if (!containerRef.current) return

      if (e.key === "Escape") {
        e.preventDefault()
        onEscape?.()
        return
      }

      if (e.key !== "Tab") return

      const focusables = getFocusableElements(containerRef.current)
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const current = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (current === first || current == null) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (current === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true)

    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      const prev = lastFocusedRef.current
      if (prev && typeof prev.focus === "function") prev.focus()
    }
  }, [active, containerRef, initialFocusRef, onEscape])
}

