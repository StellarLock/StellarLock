import { useCallback, useRef, useEffect, useState } from "react"
import { Bell, Trash2, Check, CheckCheck } from "lucide-react"
import { useNotificationCenter } from "@/hooks/useNotifications"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/utils"
import { useNavigate } from "react-router-dom"

export function NotificationCenter() {
  const navigate = useNavigate()
  const { notifications, markAsRead, markAllAsRead, clearHistory, unreadCount } = useNotificationCenter()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const handleNotificationClick = useCallback(
    (notif: any) => {
      markAsRead(notif.id)
      if (notif.lockId) {
        navigate(`/app/lock/${notif.lockId}`)
        setIsOpen(false)
      }
    },
    [markAsRead, navigate],
  )

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative inline-flex items-center justify-center rounded-lg border border-border bg-secondary p-2 transition-colors hover:bg-secondary/80"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-12 z-50 w-96 rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-semibold">Notifications</h2>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="rounded p-1 hover:bg-secondary"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearHistory} className="rounded p-1 hover:bg-secondary" title="Clear all">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/30",
                    notif.read ? "opacity-60" : "bg-primary/5",
                  )}
                >
                  {!notif.read && <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  {notif.read && <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-transparent" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium">{notif.title}</h3>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(notif.timestamp)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{notif.message}</p>
                  </div>
                  {notif.read && (
                    <div className="mt-1 shrink-0">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
