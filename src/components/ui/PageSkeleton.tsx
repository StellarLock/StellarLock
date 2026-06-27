export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6" aria-hidden>
      <div className="mb-6 h-9 w-48 animate-pulse rounded-lg bg-card" />
      <div className="mb-4 h-5 w-72 animate-pulse rounded bg-card/70" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl border border-border bg-card/50" />
        ))}
      </div>
    </div>
  )
}
