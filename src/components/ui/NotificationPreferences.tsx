import { useCallback, useState } from "react"
import { useNotificationPrefs, type NotificationType } from "@/hooks/useNotifications"
import { Button } from "@/components/ui/Button"
import { createLogger } from "@/lib/logger"

const log = createLogger("NotificationPreferences")

const NOTIFICATION_TYPES: { type: NotificationType; label: string; description: string; required?: boolean }[] = [
  {
    type: "lock_created",
    label: "Lock Created",
    description: "Notify when a new lock is created",
    required: true,
  },
  {
    type: "lock_unlocked",
    label: "Lock Unlocked",
    description: "Notify when a lock becomes unlocked",
    required: true,
  },
  {
    type: "unlock_reminder",
    label: "Unlock Reminder",
    description: "Reminder before lock unlock date",
  },
  {
    type: "beneficiary_transfer",
    label: "Beneficiary Transfer",
    description: "Notify when beneficiary is changed",
    required: true,
  },
  {
    type: "unlock_approaching",
    label: "Unlock Approaching",
    description: "Notify when unlock date is approaching",
  },
]

export function NotificationPreferences({ lockId }: { lockId?: string }) {
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
        <h3 className="mb-3 font-semibold">Browser Notifications</h3>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 hover:bg-secondary/30">
          <input
            type="checkbox"
            checked={prefs.browser}
            onChange={(e) => handleBrowserToggle(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm">Enable browser notifications</span>
        </label>
      </div>

      {/* Webhook URL */}
      <div>
        <h3 className="mb-3 font-semibold">Webhook Integration</h3>
        <input
          type="url"
          placeholder="https://example.com/webhooks/stellarlock"
          value={prefs.webhookUrl || ""}
          onChange={(e) => handleWebhookChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder-muted-foreground"
        />
        <p className="mt-2 text-xs text-muted-foreground">Optional: POST notifications to your webhook endpoint</p>
      </div>

      {/* Notification Types */}
      <div>
        <h3 className="mb-3 font-semibold">Notification Types</h3>
        <div className="space-y-2">
          {NOTIFICATION_TYPES.map(({ type, label, description, required }) => (
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
                  {label}
                  {required && <span className="ml-2 text-xs text-muted-foreground">(Required)</span>}
                </div>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {saved && <p className="text-sm text-green-600">Preferences saved!</p>}
    </div>
  )
}
