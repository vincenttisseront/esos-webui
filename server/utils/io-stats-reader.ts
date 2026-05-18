import { getActiveSSHManager } from './ssh-runtime'
import type { SessionSnapshot, DeviceSnapshot, DiskStatSnapshot } from './types'

/**
 * Lecture des métriques I/O SCST via sysfs SSH (cf. SDD v2.2 §5.1).
 *
 * Chemin racine configurable via SCST_SYSFS_PATH (compatibilité v1.2).
 * Toutes les lectures sont agrégées en une seule commande SSH pour
 * minimiser la latence et la charge réseau.
 */

const SYSFS = process.env.SCST_SYSFS_PATH ?? '/sys/kernel/scst_tgt'

export async function readSessionSnapshots(
  drivers: string[] = ['qla2x00t'],
): Promise<SessionSnapshot[]> {
  const manager = getActiveSSHManager()
  const now = Date.now()

  // Les drivers sont injectés via join(' ') — seuls des identifiants
  // alphanumériques validés par la config sont passés ici.
  const driverList = drivers.join(' ')

  const cmd = [
    `for driver in ${driverList}; do`,
    `  base="${SYSFS}/targets/$driver"`,
    `  [ -d "$base" ] || continue`,
    `  for target_dir in "$base"/*/; do`,
    `    [ -d "$target_dir" ] || continue`,
    `    target=$(basename "$target_dir")`,
    `    for session_dir in "\${target_dir}sessions"/*/; do`,
    `      [ -d "$session_dir" ] || continue`,
    `      initiator=$(basename "$session_dir")`,
    `      luns=$(ls "$session_dir/luns/" 2>/dev/null | wc -l)`,
    `      rkb=$(cat "$session_dir/read_io_count_kb" 2>/dev/null || echo 0)`,
    `      wkb=$(cat "$session_dir/write_io_count_kb" 2>/dev/null || echo 0)`,
    `      printf '%s|%s|%s|%s|%s|%s\\n' "$driver" "$target" "$initiator" "$luns" "$rkb" "$wkb"`,
    `    done`,
    `  done`,
    `done`,
  ].join('\n')

  const result = await manager.exec(cmd, 10_000)
  const snapshots: SessionSnapshot[] = []

  for (const line of result.stdout.split('\n')) {
    const parts = line.trim().split('|')
    if (parts.length < 6) continue
    const [driver, target, initiator, luns, rkb, wkb] = parts
    snapshots.push({
      capturedAt: now,
      target,
      initiator,
      driver,
      lunsCount: parseInt(luns, 10) || 0,
      readKb: parseInt(rkb, 10) || 0,
      writeKb: parseInt(wkb, 10) || 0,
    })
  }

  return snapshots
}

export async function readDeviceSnapshots(): Promise<DeviceSnapshot[]> {
  const manager = getActiveSSHManager()
  const now = Date.now()

  const cmd = [
    `for handler_dir in "${SYSFS}/handlers"/*/; do`,
    `  [ -d "$handler_dir" ] || continue`,
    `  handler=$(basename "$handler_dir")`,
    `  for device_dir in "$handler_dir"*/; do`,
    `    [ -d "$device_dir" ] || continue`,
    `    device=$(basename "$device_dir")`,
    `    rkb=$(cat "$device_dir/read_io_count_kb" 2>/dev/null || echo 0)`,
    `    wkb=$(cat "$device_dir/write_io_count_kb" 2>/dev/null || echo 0)`,
    `    rops=$(cat "$device_dir/read_io_count" 2>/dev/null || echo 0)`,
    `    wops=$(cat "$device_dir/write_io_count" 2>/dev/null || echo 0)`,
    `    printf '%s|%s|%s|%s|%s|%s\\n' "$handler" "$device" "$rkb" "$wkb" "$rops" "$wops"`,
    `  done`,
    `done`,
  ].join('\n')

  const result = await manager.exec(cmd, 10_000)
  const snapshots: DeviceSnapshot[] = []

  for (const line of result.stdout.split('\n')) {
    const parts = line.trim().split('|')
    if (parts.length < 6) continue
    const [handler, device, rkb, wkb, rops, wops] = parts
    snapshots.push({
      capturedAt: now,
      device,
      handler,
      readKb: parseInt(rkb, 10) || 0,
      writeKb: parseInt(wkb, 10) || 0,
      readOps: parseInt(rops, 10) || 0,
      writeOps: parseInt(wops, 10) || 0,
    })
  }

  return snapshots
}

/**
 * Lit /proc/diskstats pour obtenir les stats I/O des disques physiques.
 * Filtre les vrais disques (sd*, nvme*, md*, dm-*) et ignore les partitions.
 * C'est la même source de données qu'iotop/iostat.
 *
 * Format /proc/diskstats (champs 1-11):
 *   major minor name reads_completed reads_merged sectors_read time_read_ms
 *   writes_completed writes_merged sectors_written time_write_ms ios_in_progress ...
 */
export async function readDiskStatSnapshots(): Promise<DiskStatSnapshot[]> {
  const manager = getActiveSSHManager()
  const now = Date.now()

  // Keep only top-level block devices, skip partitions (sdaX, nvme0n1pX, etc.)
  const cmd = `grep -E '^\\s*[0-9]+\\s+[0-9]+\\s+(sd[a-z]+|nvme[0-9]+n[0-9]+|md[0-9]+|dm-[0-9]+)\\s' /proc/diskstats 2>/dev/null || true`

  const result = await manager.exec(cmd, 10_000)
  const snapshots: DiskStatSnapshot[] = []

  for (const line of result.stdout.split('\n')) {
    const parts = line.trim().split(/\s+/)
    // Fields: major minor name rc rm sr tr wc wm sw tw ios ...
    if (parts.length < 11) continue
    const [, , device, rc, , sr, , wc, , sw, , ios] = parts
    snapshots.push({
      capturedAt:      now,
      device:          device ?? '',
      readsCompleted:  parseInt(rc  ?? '0', 10) || 0,
      sectorsRead:     parseInt(sr  ?? '0', 10) || 0,
      writesCompleted: parseInt(wc  ?? '0', 10) || 0,
      sectorsWritten:  parseInt(sw  ?? '0', 10) || 0,
      iosInProgress:   parseInt(ios ?? '0', 10) || 0,
    })
  }

  return snapshots.filter(s => s.device)
}
