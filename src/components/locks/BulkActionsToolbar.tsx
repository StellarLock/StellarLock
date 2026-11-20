import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()
  const checkboxRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = selectedCount > 0 && !allSelected
    }
  }, [selectedCount, allSelected])

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={onSelectAll}
          className="h-4 w-4 accent-[oklch(0.78_0.16_175)]"
          aria-label={t("myLocks.bulkActions.selectAllAria")}
        />
        <span>
          {selectedCount === 0
            ? t("myLocks.bulkActions.selectAll")
            : t("myLocks.bulkActions.selectedCount", { count: selectedCount })}
        </span>
      </label>

      <div className="h-4 w-px bg-border" />

      {canExtend && (
        <Button variant="outline" size="sm" onClick={onBulkExtend} disabled={selectedCount === 0}>
          <CalendarClock className="h-4 w-4" />
          {t("myLocks.bulkActions.extendAll")}
        </Button>
      )}

      {canTransfer && (
        <Button variant="outline" size="sm" onClick={onBulkTransfer} disabled={selectedCount === 0}>
          <UserRoundPen className="h-4 w-4" />
          {t("myLocks.bulkActions.transferAll")}
        </Button>
      )}

      <button
        onClick={onClear}
        className="ms-auto rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={t("myLocks.bulkActions.cancelSelection")}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
