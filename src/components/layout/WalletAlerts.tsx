import { useEffect } from "react"
import { AlertCircle, Wifi, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useWallet } from "@/hooks/useWallet"

export function WalletAlerts() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { disconnected, networkChanged, dismissDisconnectAlert, dismissNetworkAlert, address } = useWallet()

  useEffect(() => {
    if (disconnected || networkChanged) {
      const timer = setTimeout(() => {
        if (address) return
        void navigate("/")
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [disconnected, networkChanged, address, navigate])

  return (
    <>
      {disconnected && (
        <div className="fixed top-4 end-4 z-50 flex max-w-md items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive shadow-lg">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t("wallet.disconnected")}</p>
            <p className="text-xs opacity-90">{t("wallet.disconnectedDesc")}</p>
          </div>
          <button onClick={dismissDisconnectAlert} className="shrink-0 hover:opacity-80" aria-label={t("common.back")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {networkChanged && (
        <div className="fixed top-4 end-4 z-50 flex max-w-md items-start gap-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm text-yellow-700 shadow-lg">
          <Wifi className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t("wallet.networkChanged")}</p>
            <p className="text-xs opacity-90">{t("wallet.networkChangedDesc")}</p>
          </div>
          <button onClick={dismissNetworkAlert} className="shrink-0 hover:opacity-80" aria-label={t("common.back")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  )
}
