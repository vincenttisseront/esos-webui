const inFlight = new Map<string, Promise<unknown>>()

/**
 * Coalesce concurrent async work by key (e.g. same API URL).
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const promise = fn().finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, promise as Promise<unknown>)
  return promise
}

export function singleFlightKey(url: string, query?: Record<string, unknown>): string {
  const q = query ? JSON.stringify(query, Object.keys(query).sort()) : ''
  return `${url}?${q}`
}

export function clearSingleFlight(key?: string): void {
  if (key) inFlight.delete(key)
  else inFlight.clear()
}
