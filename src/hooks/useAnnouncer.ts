import { createContext, useContext } from "react"

interface AnnouncerContextValue {
  message: string
  announce: (msg: string, priority?: "polite" | "assertive") => void
}

export const AnnouncerContext = createContext<AnnouncerContextValue>({
  message: "",
  announce: () => {},
})

export function useAnnouncer() {
  return useContext(AnnouncerContext)
}
