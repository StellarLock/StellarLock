import { useRpcHealth } from '@/hooks/useRpcHealth'
import { AlertCircle, Wifi, WifiOff } from 'lucide-react'

export function RpcStatusIndicator() {
  const { status } = useRpcHealth()

  const config = {
    connected: { color: 'bg-success', icon: Wifi, label: 'Connected' },
    slow: { color: 'bg-warning', icon: AlertCircle, label: 'Slow' },
    disconnected: { color: 'bg-destructive', icon: WifiOff, label: 'Disconnected' },
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

  if (status === 'connected') {
    return null
  }

  return (
    <div
      className={`border-b px-4 py-3 text-sm ${
        status === 'disconnected'
          ? 'border-destructive/20 bg-destructive/5 text-destructive'
          : 'border-warning/20 bg-warning/5 text-warning'
      }`}
    >
      {status === 'disconnected' ? (
        <>
          <strong>Stellar network is unreachable.</strong> Some features may be unavailable. Please check your connection.
        </>
      ) : (
        <>
          <strong>Slow network connection.</strong> Responses may take longer than usual.
        </>
      )}
    </div>
  )
}
