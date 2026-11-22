import { useEffect } from "react"
import { createLogger } from "@/lib/logger"
import { safeStorage } from "@/lib/safe-storage"

const log = createLogger("useDraftStorage")

const DRAFT_KEY_TOKEN = "stellarlock:draft:token-lock"
const DRAFT_KEY_LP = "stellarlock:draft:lp-lock"

type DraftType = "token" | "lp"

export function getDraftKey(type: DraftType): string {
  return type === "token" ? DRAFT_KEY_TOKEN : DRAFT_KEY_LP
}

export function saveDraft(type: DraftType, data: Record<string, string>): void {
  const ok = safeStorage.setItem(getDraftKey(type), JSON.stringify(data))
  if (!ok) {
    log.warn("Failed to save draft")
  }
}

export function loadDraft(type: DraftType): Record<string, string> | null {
  const data = safeStorage.getItem(getDraftKey(type))
  if (!data) return null
  try {
    return JSON.parse(data) as Record<string, string>
  } catch (e) {
    log.warn("Failed to load draft", e)
    return null
  }
}

export function clearDraft(type: DraftType): void {
  const ok = safeStorage.removeItem(getDraftKey(type))
  if (!ok) {
    log.warn("Failed to clear draft")
  }
}

export function useDraftAutoSave(
  type: DraftType,
  formData: Record<string, string>,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled) return

    const timeoutId = setTimeout(() => {
      saveDraft(type, formData)
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [type, formData, enabled])
}