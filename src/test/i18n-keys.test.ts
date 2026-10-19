import { describe, it, expect } from "vitest"
import en from "@/i18n/locales/en.json"
import es from "@/i18n/locales/es.json"
import ko from "@/i18n/locales/ko.json"
import tr from "@/i18n/locales/tr.json"
import zh from "@/i18n/locales/zh.json"

const locales = { en, es, ko, tr, zh } as unknown as Record<string, Record<string, Record<string, string>>>

describe("locale files", () => {
  it.each(Object.keys(locales))("%s defines keys referenced by LockDetail and RecentActivity", (lng) => {
    const bundle = locales[lng]
    expect(bundle.lockDetail.extendDateMustBeAfter).toContain("{{date}}")
    expect(bundle.common.pause).toBeTruthy()
    expect(bundle.common.resume).toBeTruthy()
  })

  it.each(Object.keys(locales))("%s defines notifications.preferences.* keys", (lng) => {
    const bundle = locales[lng]
    const preferences = bundle.notifications.preferences
    expect(preferences).toBeTruthy()
    expect(preferences.title).toBeTruthy()
    expect(preferences.enableNotifications).toBeTruthy()
    expect(preferences.enableNotificationsDescription).toBeTruthy()
    expect(preferences.soundEnabled).toBeTruthy()
    expect(preferences.soundEnabledDescription).toBeTruthy()
    expect(preferences.vibrationEnabled).toBeTruthy()
    expect(preferences.vibrationEnabledDescription).toBeTruthy()
    expect(preferences.quietHours).toBeTruthy()
    expect(preferences.quietHoursDescription).toBeTruthy()
    expect(preferences.quietHoursStart).toBeTruthy()
    expect(preferences.quietHoursEnd).toBeTruthy()
    expect(preferences.save).toBeTruthy()
    expect(preferences.saved).toBeTruthy()
  })

  it.each(Object.keys(locales))("%s defines notifications.types.* keys", (lng) => {
    const bundle = locales[lng]
    const types = bundle.notifications.types
    expect(types).toBeTruthy()
    expect(types.lockExtended).toBeTruthy()
    expect(types.lockExtendedDescription).toBeTruthy()
    expect(types.lockBroken).toBeTruthy()
    expect(types.lockBrokenDescription).toBeTruthy()
    expect(types.lockExpiring).toBeTruthy()
    expect(types.lockExpiringDescription).toBeTruthy()
    expect(types.friendRequest).toBeTruthy()
    expect(types.friendRequestDescription).toBeTruthy()
    expect(types.friendAccepted).toBeTruthy()
    expect(types.friendAcceptedDescription).toBeTruthy()
    expect(types.achievementUnlocked).toBeTruthy()
    expect(types.achievementUnlockedDescription).toBeTruthy()
  })
})