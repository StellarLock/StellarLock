import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNotificationPrefs, type NotificationType } from "@/hooks/useNotifications"
import { createLogger } from "@/lib/logger"

const log = createLogger("NotificationPreferences")

const NOTIFICATION_TYPES: { type: NotificationType; required?: boolean }[] = [
  {
    type: "lock_created",
    required: true,
  },
  {
    type: "lock_unlocked",
    required: true,
  },
  {
    type: "lock_withdrawn",
  },
  {
    type: "lock_extended",
  },
  {
    type: "unlock_reminder",
  },
  {
    type: "beneficiary_transfer",
    required: true,
  },
  {
    type: "unlock_approaching",
  },
]

export function NotificationPreferences({ lockId }: { lockId?: string }) {
  const { t } = useTranslation()
  const { prefs, update } = useNotificationPrefs(lockId)
  const [saved, setSaved] = useState(false)

  const toggleType = useCallback(
    (type: NotificationType, enabled: boolean) => {
      update({
        types: {
          ...prefs.types,
          [type]: enabled,
        },
      })
    },
    [prefs.types, update],
  )

  const handleBrowserToggle = useCallback(
    (enabled: boolean) => {
      if (enabled && typeof Notification !== "undefined" && Notification.permission !== "granted") {
        Notification.requestPermission()
          .then((permission) => {
            if (permission === "granted") {
              update({ browser: true })
              setSaved(true)
              setTimeout(() => setSaved(false), 2000)
            }
          })
          .catch(() => {
            log.error("Failed to request notification permission")
          })
      } else {
        update({ browser: enabled })
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    },
    [update],
  )

  const handleWebhookChange = useCallback(
    (url: string) => {
      update({ webhookUrl: url || undefined })
    },
    [update],
  )

  return (
    <div className="space-y-6">
      {/* Browser Notifications */}
      <div>
        <h3 className="mb-3 font-semibold">{t("notifications.preferences.browserHeading")}</h3>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 hover:bg-secondary/30">
          <input
            type="checkbox"
            checked={prefs.browser}
            onChange={(e) => handleBrowserToggle(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm">{t("notifications.preferences.enableBrowser")}</span>
        </label>
      </div>

      {/* Webhook URL */}
      <div>
        <h3 className="mb-3 font-semibold">{t("notifications.preferences.webhookHeading")}</h3>
        <input
          type="url"
          placeholder={t("notifications.preferences.webhookPlaceholder")}
          value={prefs.webhookUrl || ""}
          onChange={(e) => handleWebhookChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder-muted-foreground"
        />
        <p className="mt-2 text-xs text-muted-foreground">{t("notifications.preferences.webhookHint")}</p>
      </div>

      {/* Notification Types */}
      <div>
        <h3 className="mb-3 font-semibold">{t("notifications.preferences.typesHeading")}</h3>
        <div className="space-y-2">
          {NOTIFICATION_TYPES.map(({ type, required }) => (
            <label
              key={type}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-secondary/30"
            >
              <input
                type="checkbox"
                checked={prefs.types?.[type] !== false}
                onChange={(e) => toggleType(type, e.target.checked)}
                disabled={required}
                className="mt-0.5 h-4 w-4 disabled:opacity-50"
              />
              <div>
                <div className="text-sm font-medium">
                  {t(`notifications.types.${type}.label`)}
                  {required && (
                    <span className="ms-2 text-xs text-muted-foreground">
                      {t("notifications.preferences.required")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t(`notifications.types.${type}.description`)}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {saved && <p className="text-sm text-green-600">{t("notifications.preferences.saved")}</p>}
    </div>
  )
}
