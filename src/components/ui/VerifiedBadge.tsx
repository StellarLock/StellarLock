import { ShieldCheck, ShieldAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

interface Props {
  verified: boolean | null
  className?: string
  showUnverified?: boolean
}

export function VerifiedBadge({ verified, className, showUnverified = true }: Props) {
  const { t } = useTranslation()

  if (verified === null) return null

  if (verified) {
    return (
      <span
        title={t("verifiedBadge.verifiedTooltip")}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400",
          className,
        )}
      >
        <ShieldCheck className="h-3 w-3" />
        {t("verifiedBadge.verified")}
      </span>
    )
  }

  if (!showUnverified) return null

  return (
    <span
      title={t("verifiedBadge.unverifiedTooltip")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-400",
        className,
      )}
    >
      <ShieldAlert className="h-3 w-3" />
      {t("verifiedBadge.unverified")}
    </span>
  )
}