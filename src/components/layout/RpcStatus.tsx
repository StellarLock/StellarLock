import { useRpcHealth } from '@/hooks/useRpcHealth'
import { AlertCircle, Wifi, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function RpcStatusIndicator() {
  const { status } = useRpcHealth()
  const { t } = useTranslation()

  const config = {
    connected: { color: 'bg-success', icon: Wifi, label: t('rpcStatus.connected') },
    slow: { color: 'bg-warning', icon: AlertCircle, label: t('rpcStatus.slowLabel') },
    disconnected: { color: 'bg-destructive', icon: WifiOff, label: t('rpcStatus.disconnected') },
  }[status]

  const Icon = config.icon

  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${config.color} rounded-full p-0.5`} />
      <span className="text-xs text-muted-foreground hidden sm:inline">{config.label}</span>
    </div>
  )
}

export function RpcStatusBanner() {
  const { status } = useRpcHealth()
  const { t } = useTranslation()

  if (status === 'connected') {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b px-4 py-3 text-sm ${
        status === 'disconnected'
          ? 'border-destructive/20 bg-destructive/5 text-destructive'
          : 'border-warning/20 bg-warning/5 text-warning'
      }`}
    >
      {status === 'disconnected' ? (
        <>{t('rpcStatus.unreachable')}</>
      ) : (
        <>{t('rpcStatus.slow')}</>
      )}
    </div>
  )
}