export type RaidNextStepTab = 'lvm' | 'filesystems' | 'scst'
export type RaidNextStepIntentKind = 'create-pv' | 'create-filesystem' | 'create-blockio'

export interface RaidNextStepIntent {
  tab: RaidNextStepTab
  intent: RaidNextStepIntentKind
  device: string | null
}

function firstQueryValue(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : null
  return null
}

export function parseRaidNextStepIntent(query: Record<string, unknown>): RaidNextStepIntent | null {
  const tab = firstQueryValue(query.tab)
  const intent = firstQueryValue(query.intent)
  const device = firstQueryValue(query.device)
  if (!tab || !intent) return null
  const normalizedTab = tab.toLowerCase()
  const normalizedIntent = intent.toLowerCase()
  if (
    (normalizedTab !== 'lvm' && normalizedTab !== 'filesystems' && normalizedTab !== 'scst')
    || (normalizedIntent !== 'create-pv' && normalizedIntent !== 'create-filesystem' && normalizedIntent !== 'create-blockio')
  ) return null
  return {
    tab: normalizedTab as RaidNextStepTab,
    intent: normalizedIntent as RaidNextStepIntentKind,
    device: device?.trim() || null,
  }
}

export function buildRaidNextStepQuery(
  base: Record<string, unknown>,
  next: RaidNextStepIntent,
): Record<string, unknown> {
  return {
    ...base,
    tab: next.tab,
    intent: next.intent,
    ...(next.device ? { device: next.device } : {}),
  }
}

export function clearRaidNextStepQuery(base: Record<string, unknown>): Record<string, unknown> {
  const out = { ...base }
  delete out.intent
  delete out.device
  return out
}
