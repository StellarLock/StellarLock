import { useCallback, useState } from "react"

const STORAGE_KEY_PREFS = "stellarlock:notification_prefs"
const STORAGE_KEY_HISTORY = "stellarlock:notification_history"
const MAX_NOTIFICATIONS = 20
const NOTIFICATION_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days

export type NotificationType = "lock_created" | "lock_unlocked" | "unlock_reminder" | "beneficiary_transfer" | "unlock_approaching"

export interface Notification {
  id: string
  type: NotificationType
  lockId: string
  lockKind?: "token" | "lp"
  title: string
  message: string
  timestamp: number
  read: boolean
  data?: Record<string, unknown>
}

export interface NotificationPrefs {
  lockId?: string
  browser: boolean
  email?: string
  webhookUrl?: string
  types: Partial<Record<NotificationType, boolean>>
}

// ---------------------------------------------------------------------------
// Subscription API helpers
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export interface SubscribeParams {
  lockId: string
  address: string
  email?: string
  webhookUrl?: string
}

/**
 * Register (or update) an email / webhook subscription for a lock.
 * Returns the subscription id on success, throws on network or validation error.
 */
export async function subscribeNotifications(params: SubscribeParams): Promise<string> {
  const res = await fetch(`${API_BASE}/api/notifications/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lockId: params.lockId,
      address: params.address,
      email: params.email ?? null,
      webhookUrl: params.webhookUrl ?? null,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Subscribe failed (${res.status})`)
  }
  const data = await res.json() as { id: string }
  return data.id
}

/**
 * Remove an email / webhook subscription for a lock.
 */
export async function unsubscribeNotifications(lockId: string, address: string): Promise<void> {
  const params = new URLSearchParams({ lockId, address })
  const res = await fetch(`${API_BASE}/api/notifications/subscribe?${params.toString()}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Unsubscribe failed (${res.status})`)
  }
}

function loadPrefs(): Record<string, NotificationPrefs> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_PREFS) ?? "{}") as Record<string, NotificationPrefs>
  } catch {
    return {}
  }
}

function savePrefs(prefs: Record<string, NotificationPrefs>) {
  localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs))
}

function loadNotifications(): Notification[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) ?? "[]") as Notification[]
  } catch {
    return []
  }
}

function saveNotifications(notifications: Notification[]) {
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(notifications))
}

export function useNotificationPrefs(lockId?: string) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => {
    if (!lockId) return { browser: false, types: getDefaultPrefs() }
    const all = loadPrefs()
    return all[lockId] ?? { lockId, browser: false, types: getDefaultPrefs() }
  })

  const update = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch }
        // Always merge into the full prefs map — keyed either by lockId or
        // the "global" key — so writing one entry never clobbers the others.
        const all = loadPrefs()
        all[lockId ?? "global"] = next
        savePrefs(all)
        return next
      })
    },
    [lockId],
  )

  return { prefs, update }
}

/**
 * Read the global notification preferences (set from the Settings page)
 * synchronously from storage. Used by notification-sending logic that runs
 * outside of a React component (e.g. `scheduleUnlockReminder`) to decide
 * whether/how a notification should actually be delivered.
 */
function getGlobalPrefs(): NotificationPrefs {
  return loadPrefs().global ?? { browser: false, types: getDefaultPrefs() }
}

function getDefaultPrefs(): Partial<Record<NotificationType, boolean>> {
  return {
    lock_created: true,
    lock_unlocked: true,
    unlock_reminder: true,
    beneficiary_transfer: true,
    unlock_approaching: true,
  }
}

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  )

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return "denied" as const
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }, [])

  return { permission, requestPermission }
}

export function scheduleUnlockReminder(lockId: string, unlockAt: number) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return

  // Respect the global notification preferences configured on the Settings
  // page: a disabled master "browser" switch silences all reminders, and
  // each reminder category can be individually opted out of via `types`.
  const globalPrefs = getGlobalPrefs()
  if (globalPrefs.browser === false) return
  const types = globalPrefs.types ?? getDefaultPrefs()

  const now = Date.now()
  const oneDay = 24 * 60 * 60 * 1000
  const sevenDays = 7 * oneDay

  const reminders: { delay: number; label: string; type: NotificationType }[] = [
    { delay: unlockAt - sevenDays - now, label: "7 days", type: "unlock_reminder" },
    { delay: unlockAt - oneDay - now, label: "1 day", type: "unlock_reminder" },
    { delay: unlockAt - now, label: "now", type: "unlock_approaching" },
  ]

  for (const { delay, label, type } of reminders) {
    if (types[type] === false) continue
    if (delay > 0 && delay < 2_147_483_647) {
      setTimeout(() => {
        new Notification("StellarLock", {
          body:
            label === "now"
              ? `Lock #${lockId} has unlocked! You can now withdraw your tokens.`
              : `Lock #${lockId} unlocks in ${label}.`,
          icon: "/favicon.svg",
        })
      }, delay)
    }
  }
}

export interface WebhookPayload {
  event: "unlock_reminder" | "unlocked"
  lockId: string
  unlockAt: number
  reminderDays?: number
}

export async function sendWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

export function useNotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    return cleanOldNotifications(loadNotifications())
  })

  const addNotification = useCallback(
    (notif: Omit<Notification, "id" | "timestamp" | "read">) => {
      setNotifications((prev) => {
        const newNotif: Notification = {
          ...notif,
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          timestamp: Date.now(),
          read: false,
        }
        const updated = [newNotif, ...prev].slice(0, MAX_NOTIFICATIONS)
        saveNotifications(updated)
        return updated
      })
    },
    [],
  )

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      saveNotifications(updated)
      return updated
    })
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }))
      saveNotifications(updated)
      return updated
    })
  }, [])

  const clearHistory = useCallback(() => {
    setNotifications([])
    saveNotifications([])
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  return {
    notifications,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearHistory,
    unreadCount,
  }
}

function cleanOldNotifications(notifications: Notification[]): Notification[] {
  const now = Date.now()
  return notifications.filter((n) => now - n.timestamp < NOTIFICATION_TTL)
}
