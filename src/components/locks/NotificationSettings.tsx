import { useState } from "react"
import { Bell, BellOff, Webhook, Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { useNotificationPrefs, useBrowserNotifications, scheduleUnlockReminder } from "@/hooks/useNotifications"

interface Props {
  lockId: string
  unlockAt: number
}

export function NotificationSettings({ lockId, unlockAt }: Props) {
  const { t } = useTranslation()
  const { prefs, update } = useNotificationPrefs(lockId)
  const { permission, requestPermission } = useBrowserNotifications()
  const [webhookInput, setWebhookInput] = useState(prefs.webhookUrl ?? "")
  const [webhookSaved, setWebhookSaved] = useState(false)

  const isUnlocked = unlockAt <= Date.now()
  if (isUnlocked) return null

  async function toggleBrowser() {
    if (prefs.browser) {
      update({ browser: false })
      return
    }

    let perm = permission
    if (perm !== "granted") {
      perm = await requestPermission()
    }
    if (perm === "granted") {
      update({ browser: true })
      scheduleUnlockReminder(lockId, unlockAt)
    }
  }

  function saveWebhook() {
    const url = webhookInput.trim()
    update({ webhookUrl: url || undefined })
    setWebhookSaved(true)
    setTimeout(() => setWebhookSaved(false), 2000)
  }

  return (
    <div className="border-t border-border p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Bell className="h-4 w-4" />
        {t("notifications.title")}
      </h3>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-3">
          <div className="flex items-center gap-3">
            {prefs.browser ? (
              <Bell className="h-4 w-4 text-primary" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">{t("notifications.browser")}</p>
              <p className="text-xs text-muted-foreground">{t("notifications.browserDesc")}</p>
            </div>
          </div>
          <Button variant={prefs.browser ? "primary" : "outline"} size="sm" onClick={() => void toggleBrowser()}>
            {prefs.browser ? t("notifications.enabled") : t("notifications.enable")}
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-background/40 p-3">
          <div className="mb-3 flex items-center gap-3">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("notifications.webhook")}</p>
              <p className="text-xs text-muted-foreground">{t("notifications.webhookDesc")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="https://..."
              value={webhookInput}
              onChange={(e) => setWebhookInput(e.target.value)}
              className="flex-1 font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={saveWebhook}>
              {webhookSaved ? <Check className="h-4 w-4 text-success" /> : t("notifications.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
