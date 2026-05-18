/**
 * Parser ALUA sysfs — SDD v3.8 §3.4
 * Ligne type :
 *   /sys/kernel/scst_tgt/device_groups/esos/target_groups/local/state=active
 */
import type { ALUAState, ALUAGroup } from '../types'

/**
 * Parse la sortie :
 *   find /sys/kernel/scst_tgt/device_groups -name state | while read f; do echo "$f=$(cat $f)"; done
 */
export function parseALUASysfs(raw: string): ALUAGroup[] {
  const results: ALUAGroup[] = []

  for (const line of raw.split('\n')) {
    if (!line.includes('target_groups') || !line.includes('state=')) continue

    // Format : /path/to/state=active
    const eqIdx = line.lastIndexOf('=')
    if (eqIdx === -1) continue
    const path  = line.slice(0, eqIdx)
    const state = line.slice(eqIdx + 1).trim()
    const parts = path.split('/')

    const dgIdx = parts.indexOf('device_groups')
    const tgIdx = parts.indexOf('target_groups')
    if (dgIdx === -1 || tgIdx === -1) continue

    results.push({
      deviceGroup: parts[dgIdx + 1] ?? '',
      targetGroup: parts[tgIdx + 1] ?? '',
      groupId:     0,
      state:       mapALUAState(state),
      targets:     [],
    })
  }

  return results
}

function mapALUAState(raw: string): ALUAState {
  const valid: ALUAState[] = ['active', 'nonoptimized', 'standby', 'unavailable']
  return valid.includes(raw as ALUAState) ? (raw as ALUAState) : 'unknown'
}
