import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import en from "./locales/en.json"
import es from "./locales/es.json"
import zh from "./locales/zh.json"
import ko from "./locales/ko.json"
import tr from "./locales/tr.json"
import ar from "./locales/ar.json"

i18n
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

export default i18n
