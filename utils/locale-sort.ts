/** Stable locale-aware string compare for `.sort()` (Sonar typescript:S2871). */
export function compareByLocale(a: string, b: string): number {
  return String.prototype.localeCompare.call(a, b)
}

export function sortByLocale(items: Iterable<string>): string[] {
  return [...items].sort(compareByLocale)
}
