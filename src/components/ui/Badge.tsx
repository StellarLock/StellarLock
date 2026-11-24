import { cva, type VariantProps } from "class-variance-authority"
import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-secondary text-secondary-foreground",
      primary: "bg-primary/15 text-primary border border-primary/30",
      success: "bg-success/15 text-success border border-success/30",
      warning: "bg-warning/15 text-warning border border-warning/30",
      destructive: "bg-destructive/15 text-destructive border border-destructive/30",
      outline: "border border-border text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
})

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
