import { CopyButton } from "@/components/ui/CopyButton"
import { shortAddress } from "@/lib/utils"

export function CopyableAddress({ address, className }: { address: string; className?: string }) {
    return (
        <span className={className}>
            <span className="font-mono">{shortAddress(address)}</span>
            <CopyButton text={address} className="ml-1 inline" />
        </span>
    )
}

