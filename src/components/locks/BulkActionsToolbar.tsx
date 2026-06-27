import { X, CalendarClock, UserRoundPen } from "lucide-react"
import { Button } from "@/components/ui/Button"

interface Props {
  selectedCount: number
  onClear: () => void
  onSelectAll: () => void
  allSelected: boolean
  onBulkExtend: () => void
  onBulkTransfer: () => void
  canExtend: boolean
  canTransfer: boolean
}

export function BulkActionsToolbar({
  selectedCount,
  onClear,
  onSelectAll,
  allSelected,
  onBulkExtend,
  onBulkTransfer,
  canExtend,
  canTransfer,
}: Props) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onSelectAll}
          className="h-4 w-4 accent-[oklch(0.78_0.16_175)]"
          aria-label="Select all locks"
        />
        <span>
          {selectedCount === 0 ? "Select all" : `${selectedCount} selected`}
        </span>
      </label>

      <div className="h-4 w-px bg-border" />

      {canExtend && (
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkExtend}
          disabled={selectedCount === 0}
        >
          <CalendarClock className="h-4 w-4" />
          Extend all
        </Button>
      )}

      {canTransfer && (
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkTransfer}
          disabled={selectedCount === 0}
        >
          <UserRoundPen className="h-4 w-4" />
          Transfer all
        </Button>
      )}

      <button
        onClick={onClear}
        className="ml-auto rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Cancel selection"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
