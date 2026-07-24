import { useTranslation } from "react-i18next"
import { Globe } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { useState } from "react"

const languages = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
]

export function LanguageSelector() {
  const { i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  // Document dir/lang is handled centrally by the i18n `languageChanged` hook.

  const changeLanguage = (lng: string) => {
    void i18n.changeLanguage(lng)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select language"
        aria-expanded={isOpen}
        aria-controls="language-menu"
      >
        <Globe className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div
          id="language-menu"
          className="absolute end-0 mt-2 w-32 rounded-lg border border-border bg-card shadow-lg z-50"
        >
          {languages.map((lng) => (
            <button
              key={lng.code}
              onClick={() => changeLanguage(lng.code)}
              className="block w-full px-4 py-2 text-sm text-start hover:bg-secondary rounded-lg"
            >
              {lng.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
