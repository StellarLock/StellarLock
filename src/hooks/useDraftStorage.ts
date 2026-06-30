const DRAFT_KEY_TOKEN = "stellarlock:draft:token-lock"
const DRAFT_KEY_LP = "stellarlock:draft:lp-lock"

export type DraftType = "token" | "lp"

export function getDraftKey(type: DraftType): string {
  return type === "token" ? DRAFT_KEY_TOKEN : DRAFT_KEY_LP
}

export function saveDraft(type: DraftType, data: Record<string, string>): void {
  try {
    localStorage.setItem(getDraftKey(type), JSON.stringify(data))
  } catch (e) {
    const { createLogger } = await import("@/lib/logger"); createLogger("useDraftStorage").warn("Failed to save draft", e)
  }
}

export function loadDraft(type: DraftType): Record<string, string> | null {
  try {
    const data = localStorage.getItem(getDraftKey(type))
    return data ? JSON.parse(data) : null
  } catch (e) {
    log.warn("Failed to load draft", e)
    return null
  }
}

export function clearDraft(type: DraftType): void {
  try {
    localStorage.removeItem(getDraftKey(type))
  } catch (e) {
    log.warn("Failed to clear draft", e)
  }
}

export function useDraftAutoSave(
  type: DraftType,
  formData: Record<string, string>,
  enabled: boolean = true,
) {
  if (!enabled) return

  const timeoutId = setTimeout(() => {
    saveDraft(type, formData)
  }, 500)

  return () => clearTimeout(timeoutId)
}
