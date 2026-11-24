import { Lock as LockIcon, Unlock, Check } from "lucide-react"
import type { LockStatus } from "@/types/lock"
import { Badge } from "@/components/ui/Badge"

export function StatusBadge({ status }: { status: LockStatus }) {
  if (status === "locked") {
    return (
      <Badge variant="primary">
        <LockIcon className="h-3 w-3" />
        Locked
      </Badge>
    )
  }
  if (status === "unlockable") {
    return (
      <Badge variant="warning">
        <Unlock className="h-3 w-3" />
        Unlockable
      </Badge>
    )
  }
  return (
    <Badge variant="outline">
      <Check className="h-3 w-3" />
      Withdrawn
    </Badge>
  )
}
