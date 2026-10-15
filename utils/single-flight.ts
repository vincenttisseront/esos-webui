import { compareByLocale } from '~/utils/locale-sort'

const inFlight = new Map<string, Promise<unknown>>()

/**
 * Coalesce concurrent async work by key (e.g. same API URL).
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (inFlight.has(key)) {
    return inFlight.get(key) as Promise<T>
  }

  const promise = fn().finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, promise as Promise<unknown>)
  return promise
}

export function singleFlightKey(url: string, query?: Record<string, unknown>): string {
  const q = query
    ? JSON.stringify(query, Object.keys(query).sort(compareByLocale))
    : ''
  return `${url}?${q}`
}

export function clearSingleFlight(key?: string): void {
  if (key) inFlight.delete(key)
  else inFlight.clear()
}
