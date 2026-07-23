import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import en from "./locales/en.json"
import es from "./locales/es.json"
import zh from "./locales/zh.json"
import ko from "./locales/ko.json"
import tr from "./locales/tr.json"
import ar from "./locales/ar.json"

// Languages that render right-to-left. Keep in sync with the resources below.
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"])

function applyDocumentDirection(lng: string | undefined) {
  if (typeof document === "undefined") return
  const base = (lng ?? "en").split("-")[0]
  const root = document.documentElement
  root.lang = base
  root.dir = RTL_LANGUAGES.has(base) ? "rtl" : "ltr"
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      zh: { translation: zh },
      ko: { translation: ko },
      tr: { translation: tr },
      ar: { translation: ar },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
      lookupQuerystring: "lng",
    },
  })
  .then(() => {
    // Apply direction for the language the detector resolved on first load,
    // not just on subsequent switches.
    applyDocumentDirection(i18n.language)
  })

i18n.on("languageChanged", applyDocumentDirection)

export default i18n
