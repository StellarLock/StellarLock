import { cn } from "@/lib/utils"
import { useCallback, useRef } from "react"

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
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      const itemsCount = items.length
      let nextIndex: number | null = null

      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          e.preventDefault()
          nextIndex = (currentIndex + 1) % itemsCount
          break
        case "ArrowLeft":
        case "ArrowUp":
          e.preventDefault()
          nextIndex = (currentIndex - 1 + itemsCount) % itemsCount
          break
        case "Home":
          e.preventDefault()
          nextIndex = 0
          break
        case "End":
          e.preventDefault()
          nextIndex = itemsCount - 1
          break
      }

      if (nextIndex !== null && nextIndex !== currentIndex) {
        onChange(items[nextIndex].value)
        tabRefs.current[nextIndex]?.focus()
      }
    },
    [items, onChange],
  )

  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1", className)}
    >
      {items.map((item, index) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
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
