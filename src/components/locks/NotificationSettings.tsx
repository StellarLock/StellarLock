// NOTE: Browser push and webhook are handled entirely client-side.
// Email notifications call the server-side subscription API — see
// api/notifications/subscribe.ts and indexer/notifier.ts.
import { useState } from "react"
import { Bell, BellOff, Mail, Webhook, Check, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import {
  useNotificationPrefs,
  useBrowserNotifications,
  scheduleUnlockReminder,
  subscribeNotifications,
  unsubscribeNotifications,
} from "@/hooks/useNotifications"

interface Props {
  lockId: string
  unlockAt: number
  /** Connected wallet address — required to register server-side subscriptions. */
  address?: string
}

export function NotificationSettings({ lockId, unlockAt, address }: Props) {
  const { t } = useTranslation()
  const { prefs, update } = useNotificationPrefs(lockId)
  const { permission, requestPermission } = useBrowserNotifications()
  const [webhookInput, setWebhookInput] = useState(prefs.webhookUrl ?? "")
  const [webhookSaved, setWebhookSaved] = useState(false)

  // Email state
  const [emailInput, setEmailInput] = useState(prefs.email ?? "")
  const [emailSaved, setEmailSaved] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)

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

  async function saveEmail() {
    const email = emailInput.trim()
    setEmailError(null)

    if (!email) {
      // Empty input — unsubscribe if previously subscribed
      if (prefs.email && address) {
        setEmailLoading(true)
        try {
          await unsubscribeNotifications(lockId, address)
          update({ email: undefined })
        } catch (err) {
          setEmailError(err instanceof Error ? err.message : t("notifications.emailError"))
        } finally {
          setEmailLoading(false)
        }
      }
      return
    }

    if (!address) {
      setEmailError(t("notifications.emailNeedsWallet"))
      return
    }

    setEmailLoading(true)
    try {
      await subscribeNotifications({ lockId, address, email, webhookUrl: prefs.webhookUrl })
      update({ email })
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 2000)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : t("notifications.emailError"))
    } finally {
      setEmailLoading(false)
    }
  }

  return (
    <div className="border-t border-border p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Bell className="h-4 w-4" />
        {t("notifications.title")}
      </h3>

      <div className="flex flex-col gap-4">
        {/* Browser push */}
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

        {/* Email */}
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <div className="mb-3 flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("notifications.email")}</p>
              <p className="text-xs text-muted-foreground">{t("notifications.emailDesc")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder={t("notifications.emailPlaceholder")}
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); setEmailError(null) }}
              className="flex-1 text-xs"
              aria-label={t("notifications.email")}
              aria-invalid={emailError != null}
              aria-describedby={emailError ? "email-notif-error" : undefined}
              disabled={emailLoading}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveEmail()}
              disabled={emailLoading}
              aria-label={t("notifications.save")}
            >
              {emailLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : emailSaved ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                t("notifications.save")
              )}
            </Button>
          </div>
          {emailError && (
            <p id="email-notif-error" className="mt-1.5 text-xs text-destructive" role="alert">
              {emailError}
            </p>
          )}
        </div>

        {/* Webhook */}
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
