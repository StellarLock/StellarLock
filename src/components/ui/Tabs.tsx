import { cn } from "@/lib/utils"

export interface TabItem {
  value: string
  label: string
  count?: number
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1", className)}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
