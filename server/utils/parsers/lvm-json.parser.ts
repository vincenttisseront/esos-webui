/**
 * Parse LVM --reportformat json output (pvs/vgs/lvs).
 */
export interface LvmJsonRow {
  [key: string]: string
}

function rowsFromReport(jsonText: string, section: 'pv' | 'vg' | 'lv'): LvmJsonRow[] {
  if (!jsonText.trim()) return []
  try {
    const parsed = JSON.parse(jsonText) as { report?: Array<Record<string, LvmJsonRow[]>> }
    const report = parsed.report ?? []
    const rows: LvmJsonRow[] = []
    for (const block of report) {
      const sectionRows = block[section]
      if (Array.isArray(sectionRows)) rows.push(...sectionRows)
    }
    return rows
  } catch {
    return []
  }
}

function num(row: LvmJsonRow, key: string): number {
  const v = row[key]
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function str(row: LvmJsonRow, key: string): string {
  return String(row[key] ?? '').trim()
}

export function parsePvsJson(jsonText: string): Array<{
  path: string
  vgName: string
  sizeBytes: number
  freeBytes: number
  uuid: string
  devSizeBytes: number
  attr: string
}> {
  return rowsFromReport(jsonText, 'pv').map(row => ({
    path: str(row, 'pv_name'),
    vgName: str(row, 'vg_name'),
    sizeBytes: num(row, 'pv_size'),
    freeBytes: num(row, 'pv_free'),
    uuid: str(row, 'pv_uuid'),
    devSizeBytes: num(row, 'dev_size'),
    attr: str(row, 'pv_attr'),
  })).filter(r => r.path)
}

export function parseVgsJson(jsonText: string): Array<{
  name: string
  uuid: string
  sizeBytes: number
  freeBytes: number
  pvCount: number
  lvCount: number
  attr: string
  clustered: boolean
}> {
  return rowsFromReport(jsonText, 'vg').map(row => ({
    name: str(row, 'vg_name'),
    uuid: str(row, 'vg_uuid'),
    sizeBytes: num(row, 'vg_size'),
    freeBytes: num(row, 'vg_free'),
    pvCount: num(row, 'pv_count'),
    lvCount: num(row, 'lv_count'),
    attr: str(row, 'vg_attr'),
    clustered: str(row, 'vg_clustered') === 'yes' || str(row, 'vg_clustered') === '1',
  })).filter(r => r.name)
}

function normalizeLvNames(row: LvmJsonRow): { vgName: string; lvName: string } {
  let vgName = str(row, 'vg_name')
  let lvName = str(row, 'lv_name')
  const full = str(row, 'lv_full_name')
  if (!lvName && full) {
    const slash = full.indexOf('/')
    if (slash >= 0) {
      vgName = vgName || full.slice(0, slash)
      lvName = full.slice(slash + 1)
    } else {
      lvName = full
    }
  }
  if (lvName.includes('/') && !vgName) {
    const parts = lvName.split('/').filter(Boolean)
    if (parts.length >= 2) {
      vgName = parts[0]!
      lvName = parts.slice(1).join('/')
    }
  }
  if (!lvName && vgName && full) lvName = full.replace(new RegExp(`^${vgName}/`), '')
  return { vgName, lvName }
}

export function parseLvsJson(jsonText: string): Array<{
  name: string
  vgName: string
  lvPath: string
  lvDmPath: string
  sizeBytes: number
  uuid: string
  attr: string
  active: boolean
}> {
  return rowsFromReport(jsonText, 'lv').map((row) => {
    const { vgName, lvName } = normalizeLvNames(row)
    const attr = str(row, 'lv_attr')
    return {
      name: lvName,
      vgName,
      lvPath: str(row, 'lv_path'),
      lvDmPath: str(row, 'lv_dm_path'),
      sizeBytes: num(row, 'lv_size'),
      uuid: str(row, 'lv_uuid'),
      attr,
      active: attr.length >= 5 && attr[4] === 'a',
    }
  }).filter(r => r.name && r.vgName)
}
