import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { getTokenMetadata, type TokenMetadata } from "@/lib/token-metadata"
import { Check } from "lucide-react"

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" }
const BADGE_SIZES = { sm: "h-3 w-3", md: "h-4 w-4", lg: "h-5 w-5" }

function Monogram({ symbol, size, className }: { symbol: string; size: keyof typeof SIZES; className?: string }) {
  const letters = symbol
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase()
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary ring-1 ring-primary/25",
        SIZES[size],
        className,
      )}
      aria-hidden
    >
      {letters || "?"}
    </div>
  )
}

export function TokenAvatar({
  symbol,
  contractId,
  size = "md",
  className,
  showVerified = false,
}: {
  symbol: string
  contractId?: string
  size?: keyof typeof SIZES
  className?: string
  showVerified?: boolean
}) {
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    if (!contractId) return
    getTokenMetadata(contractId).then(setMetadata).catch(() => setMetadata(null))
  }, [contractId])

  const hasLogo = metadata?.logo && !imageError
  const isVerified = showVerified && metadata?.verified

  if (hasLogo) {
    return (
      <div className={cn("relative shrink-0", SIZES[size], className)}>
        <img
          src={metadata.logo}
          alt={symbol}
          className="h-full w-full rounded-full object-cover ring-1 ring-primary/25"
          onError={() => setImageError(true)}
        />
        {isVerified && (
          <div className={cn("absolute -bottom-0.5 -right-0.5 rounded-full bg-green-500 p-0.5", BADGE_SIZES[size])}>
            <Check className="h-full w-full text-white" strokeWidth={3} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <Monogram symbol={symbol} size={size} className={className} />
      {isVerified && (
        <div className={cn("absolute -bottom-0.5 -right-0.5 rounded-full bg-green-500 p-0.5", BADGE_SIZES[size])}>
          <Check className="h-full w-full text-white" strokeWidth={3} />
        </div>
      )}
    </div>
  )
}
