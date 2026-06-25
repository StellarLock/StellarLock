import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY_PREFS = "stellarlock:notification_prefs"
const STORAGE_KEY_HISTORY = "stellarlock:notification_history"
const MAX_NOTIFICATIONS = 20
const NOTIFICATION_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days

export type NotificationType = "lock_created" | "lock_unlocked" | "unlock_reminder" | "beneficiary_transfer" | "unlock_approaching"

export interface Notification {
  id: string
  type: NotificationType
  lockId: string
  title: string
  message: string
  timestamp: number
  read: boolean
  data?: Record<string, unknown>
}

export interface NotificationPrefs {
  lockId?: string
  browser: boolean
  webhookUrl?: string
  types: Partial<Record<NotificationType, boolean>>
}

function loadPrefs(): Record<string, NotificationPrefs> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_PREFS) ?? "{}")
  } catch {
    return {}
  }
}

function savePrefs(prefs: Record<string, NotificationPrefs>) {
  localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs))
}

function loadNotifications(): Notification[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) ?? "[]")
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
        if (lockId) {
          const all = loadPrefs()
          all[lockId] = next
          savePrefs(all)
        } else {
          savePrefs({ global: next })
        }
        return next
      })
    },
    [lockId],
  )

  return { prefs, update }
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

  const now = Date.now()
  const oneDay = 24 * 60 * 60 * 1000
  const sevenDays = 7 * oneDay

  const reminders = [
    { delay: unlockAt - sevenDays - now, label: "7 days" },
    { delay: unlockAt - oneDay - now, label: "1 day" },
    { delay: unlockAt - now, label: "now" },
  ]

  for (const { delay, label } of reminders) {
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
