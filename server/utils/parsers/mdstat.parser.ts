/**
 * Parser pour /proc/mdstat (SDD v3.12 §6.2).
 */
import type { MdArray, MdMemberDevice, MdProgress } from '../raid-types'

/**
 * Parse le contenu brut de /proc/mdstat et retourne les arrays MD détectés.
 */
export function parseMdstat(output: string): MdArray[] {
  const arrays: MdArray[] = []
  const lines = output.split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Ligne de définition d'array : md0 : active raid1 sda1[0] sdb1[1]
    const arrayMatch = line.match(/^(md\w+)\s*:\s*(\w+)(?:\s+\([^)]+\))*\s+(?:raid(\w+)|linear)\s*(.*)$/)
    if (!arrayMatch) {
      i++
      continue
    }

    const name = arrayMatch[1]
    const stateWord = arrayMatch[2].toLowerCase()   // active, inactive, ...
    const levelStr = arrayMatch[3] ?? 'linear'
    const memberStr = arrayMatch[4] ?? ''

    // Parse members depuis la première ligne
    const members = parseMembersFromLine(memberStr)

    // Ligne suivante : taille + chunks
    let sizeBytes: number | undefined
    let chunkKb: number | undefined
    let raidDevices = members.length
    let activeDevices = 0
    let workingDevices = 0
    let failedDevices = 0
    let spareDevices = 0
    let progress: MdProgress | undefined

    i++
    if (i < lines.length) {
      const sizeLine = lines[i]
      // Exemple : 2930135552 blocks super 1.2 [2/2] [UU]
      const sizeMatch = sizeLine.match(/(\d+)\s+blocks/)
      if (sizeMatch) {
        sizeBytes = parseInt(sizeMatch[1], 10) * 1024
        i++
      }

      const chunkMatch = sizeLine.match(/chunk\s+(\d+)k/i) ?? sizeLine.match(/(\d+)k\s+chunks?/i)
      if (chunkMatch) {
        chunkKb = parseInt(chunkMatch[1], 10)
      }

      // Parse [N/M] [UU_]
      const countMatch = sizeLine.match(/\[(\d+)\/(\d+)\]/)
      if (countMatch) {
        raidDevices = parseInt(countMatch[1], 10)
        workingDevices = parseInt(countMatch[2], 10)
      }

      const statusMatch = sizeLine.match(/\[([U_]+)\]/)
      if (statusMatch) {
        const statusStr = statusMatch[1]
        activeDevices = (statusStr.match(/U/g) ?? []).length
        failedDevices = (statusStr.match(/_/g) ?? []).length
      }

      // Ligne de spare/progress (optionnelle)
      if (i < lines.length && /(resync|recovery|reshape|check|repair)\s*=/.test(lines[i])) {
        progress = parseProgressLine(lines[i])
        i++
      }
      if (i < lines.length && lines[i].trim().match(/^\s*\[=*>/)) {
        // barre de progression ASCII
        const progMatch = lines[i].match(/(\d+)%/)
        if (progMatch && progress) {
          progress.percent = parseInt(progMatch[1], 10)
        }
        i++
      }
    }

    spareDevices = members.filter(m => m.state.includes('spare')).length
    if (activeDevices === 0 && failedDevices === 0 && members.length > 0) {
      activeDevices = members.filter(m => m.state.includes('active') || m.state.includes('sync')).length
    }
    if (workingDevices === 0 && members.length > 0) {
      workingDevices = members.filter(m => !m.state.includes('faulty') && !m.state.includes('removed')).length
    }

    const state = resolveArrayState(stateWord, failedDevices, progress)
    const raidLevel = resolveLevel(levelStr) as MdArray['raidLevel']

    arrays.push({
      name,
      path: `/dev/${name}`,
      raidLevel,
      state,
      sizeBytes,
      chunkKb,
      raidDevices,
      activeDevices,
      workingDevices,
      failedDevices,
      spareDevices,
      members,
      progress,
      syncAction: progress?.action,
      usedBy: [],
      warnings: failedDevices > 0 ? [`${failedDevices} membre(s) en échec`] : [],
    })
  }

  return arrays
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMembersFromLine(memberStr: string): MdMemberDevice[] {
  const members: MdMemberDevice[] = []
  // Exemple: sda1[0] sdb1[1](F) sdc1[2](S)
  const pattern = /(\S+)\[(\d+)\](\([FS]\))?/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(memberStr)) !== null) {
    const devName = m[1]
    const role = parseInt(m[2], 10)
    const flagPart = m[3] ?? ''
    const state: MdMemberDevice['state'] = []

    if (flagPart === '(F)') {
      state.push('faulty')
    } else if (flagPart === '(S)') {
      state.push('spare')
    } else {
      state.push('active')
      state.push('sync')
    }

    const path = devName.startsWith('/') ? devName : `/dev/${devName}`
    members.push({ path, role, state })
  }
  return members
}

function parseProgressLine(line: string): MdProgress | undefined {
  const actionMatch = line.match(/\b(resync|recovery|reshape|check|repair)\b/)
  if (!actionMatch) return undefined

  const action = actionMatch[1] as MdProgress['action']
  const percentMatch = line.match(/(\d+(?:\.\d+)?)%/)
  const percent = percentMatch ? parseFloat(percentMatch[1]) : 0

  const etaMatch = line.match(/finish=(\S+)/)
  const speedMatch = line.match(/speed=(\d+)K/)

  return {
    action,
    percent,
    finishEta: etaMatch?.[1],
    speedKbps: speedMatch ? parseInt(speedMatch[1], 10) : undefined,
  }
}

function resolveArrayState(
  stateWord: string,
  failedDevices: number,
  progress?: MdProgress,
): MdArray['state'] {
  if (progress?.action === 'recovery') return 'recovering'
  if (progress?.action === 'resync') return 'resync'
  if (stateWord === 'inactive') return 'inactive'
  if (failedDevices > 0) return 'degraded'
  if (stateWord === 'active') return 'active'
  if (stateWord === 'clean') return 'clean'
  return 'unknown'
}

function resolveLevel(level: string): MdArray['raidLevel'] {
  const map: Record<string, MdArray['raidLevel']> = {
    '0': '0', '1': '1', '4': '4', '5': '5', '6': '6', '10': '10', 'linear': 'linear',
  }
  return map[level] ?? 'unknown'
}
