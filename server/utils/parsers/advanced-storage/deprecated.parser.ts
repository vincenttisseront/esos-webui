import type { DeprecatedTechStatus } from '../../../../types/advanced-storage'

export function parseDeprecatedSection(raw: string): DeprecatedTechStatus[] {
  const out: DeprecatedTechStatus[] = []
  const has = (key: string) => raw.includes(`${key}=1`) || raw.includes(`${key}=yes`)

  if (has('lessfs')) {
    out.push({ id: 'lessfs', detected: true, reason: 'binary_or_module' })
  }
  if (has('enhanceio')) {
    out.push({ id: 'enhanceio', detected: true, reason: 'binary_or_module' })
  }
  if (has('btier')) {
    out.push({ id: 'btier', detected: true, reason: 'rc_or_module' })
  }

  return out
}
