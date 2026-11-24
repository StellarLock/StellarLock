import { useCallback, useEffect, useState } from "react"

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/** Tiny data-fetching helper so we don't fetch inside bare useEffects ad hoc. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fn()
      .then((res) => {
        if (active) setData(res)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Something went wrong")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { data, loading, error, reload }
}
