import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  className?: string
}

export function Pagination({ page, pageSize, total, onChange, className }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  return (
    <div className={cn("flex items-center justify-center gap-3 mt-6", className)}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
      >
        <ChevronLeft className="h-4 w-4" />
        Prev
      </button>
      <span className="text-sm text-muted-foreground tabular-nums">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
