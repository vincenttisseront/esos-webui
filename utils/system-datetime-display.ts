/**
 * Format ESOS system clock (UTC ISO from `date -u`) for display in configured IANA timezone.
 */

export type SystemDateTimeDisplay = {
  localMain: string
  utcSecondary: string | null
  effectiveTimezone: string
  timezoneUnknown: boolean
  invalidTime: boolean
}

/** Parse backend `currentTime` (ISO ending in Z = UTC). */
export function parseSystemTimeUtc(iso: string | null | undefined): Date | null {
  const raw = (iso ?? '').trim()
  if (!raw) return null
  const normalized = /Z$/i.test(raw) ? raw : (raw.includes('T') ? `${raw}Z` : raw)
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Validate IANA zone; fallback to UTC when unknown. */
export function resolveDisplayTimezone(tz: string | null | undefined): {
  zone: string
  unknown: boolean
} {
  const raw = (tz ?? '').trim()
  if (!raw) return { zone: 'UTC', unknown: true }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: raw })
    return { zone: raw, unknown: false }
  } catch {
    return { zone: 'UTC', unknown: true }
  }
}

function partMap(date: Date, timeZone: string, locale: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  return map
}

function formatLocalInstant(date: Date, timeZone: string, localeTag: string): string {
  const p = partMap(date, timeZone, localeTag)
  if (localeTag.startsWith('fr')) {
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`
  }
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

function formatUtcInstant(date: Date): string {
  const p = partMap(date, 'UTC', 'en-GB')
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

export function formatSystemDateTimeDisplay(params: {
  currentTimeUtc: string | null | undefined
  timezone: string | null | undefined
  locale: string
  /** i18n suffix when timezone is unknown and UTC fallback is used */
  utcFallbackLabel?: string
}): SystemDateTimeDisplay {
  const instant = parseSystemTimeUtc(params.currentTimeUtc)
  const { zone, unknown } = resolveDisplayTimezone(params.timezone)
  const localeTag = params.locale === 'en' ? 'en-GB' : 'fr-FR'

  if (!instant) {
    return {
      localMain:           '—',
      utcSecondary:        null,
      effectiveTimezone:   zone,
      timezoneUnknown:     unknown,
      invalidTime:         true,
    }
  }

  const localDate = formatLocalInstant(instant, zone, localeTag)
  const tzSuffix = unknown && params.utcFallbackLabel
    ? `${zone} (${params.utcFallbackLabel})`
    : zone

  return {
    localMain:         `${localDate} ${tzSuffix}`,
    utcSecondary:      `${formatUtcInstant(instant)} UTC`,
    effectiveTimezone: zone,
    timezoneUnknown:   unknown,
    invalidTime:       false,
  }
}
