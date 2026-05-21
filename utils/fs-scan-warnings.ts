/** Low-signal scan messages that should not surface as primary warnings. */
const INFORMATIONAL_PATTERNS = [
  /^no\s+/i,
  /^skipped\b/i,
  /^using\s+fallback/i,
  /^findmnt\b/i,
  /^df\b/i,
]

export function filterActionableScanWarnings(warnings: string[]): string[] {
  return warnings
    .map(w => w.trim())
    .filter(w => w.length > 0)
    .filter(w => !INFORMATIONAL_PATTERNS.some(p => p.test(w)))
}
