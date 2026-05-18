import { defineStore } from 'pinia'
import type { SessionThroughput, DeviceThroughput, DiskStatThroughput } from '~/server/utils/types'

/**
 * Store Pinia pour les métriques I/O temps réel (cf. SDD v2.2 §6).
 * Polling toutes les 10s. Le calcul des débits est délégué au serveur
 * (ring buffer dans metrics-store.ts).
 */

interface StatsState {
  sessions:   SessionThroughput[]
  devices:    DeviceThroughput[]
  disks:      DiskStatThroughput[]
  capturedAt: number | null
  loading:    boolean
  error:      string | null
  pollInterval: ReturnType<typeof setInterval> | null
}

export const useStatsStore = defineStore('stats', {
  state: (): StatsState => ({
    sessions:     [],
    devices:      [],
    disks:        [],
    capturedAt:   null,
    loading:      false,
    error:        null,
    pollInterval: null,
  }),

  getters: {
    /** Sessions triées par débit total décroissant (les plus actives en tête). */
    sessionsByActivity: (s) =>
      [...s.sessions].sort(
        (a, b) =>
          b.readKbPerSec + b.writeKbPerSec - (a.readKbPerSec + a.writeKbPerSec),
      ),

    totalReadKbps: (s) =>
      s.sessions.reduce((acc, sess) => acc + sess.readKbPerSec, 0),

    totalWriteKbps: (s) =>
      s.sessions.reduce((acc, sess) => acc + sess.writeKbPerSec, 0),

    totalReadFormatted(): string {
      return formatKbps(this.totalReadKbps as number)
    },

    totalWriteFormatted(): string {
      return formatKbps(this.totalWriteKbps as number)
    },
  },

  actions: {
    async fetchAll() {
      const sshStore = useSSHStore()
      if (!sshStore.isReady) return

      this.loading = true
      this.error = null

      try {
        const { isAll, activeSans, effective } = useSelectedSan()

        if (isAll.value) {
          // ─── Aggregate mode: fetch all SANs in parallel and merge ───────────
          const sanIds = activeSans.value.map(s => s.id)
          const allResults = await Promise.allSettled(
            sanIds.flatMap(sanId => [
              $fetch<{ sessions: SessionThroughput[]; capturedAt: number }>(
                '/api/stats/sessions', { query: { sanId } },
              ),
              $fetch<{ devices: DeviceThroughput[]; capturedAt: number }>(
                '/api/stats/devices', { query: { sanId } },
              ),
              $fetch<{ disks: DiskStatThroughput[]; capturedAt: number }>(
                '/api/stats/diskstats', { query: { sanId } },
              ),
            ]),
          )

          const sessions: SessionThroughput[] = []
          const devices:  DeviceThroughput[]  = []
          const disks:    DiskStatThroughput[] = []
          let capturedAt = 0

          for (let i = 0; i < allResults.length; i += 3) {
            const sessRes = allResults[i]
            const devRes  = allResults[i + 1]
            const dskRes  = allResults[i + 2]
            if (sessRes.status === 'fulfilled') {
              sessions.push(...sessRes.value.sessions)
              capturedAt = Math.max(capturedAt, sessRes.value.capturedAt)
            }
            if (devRes.status === 'fulfilled') {
              devices.push(...devRes.value.devices)
            }
            if (dskRes.status === 'fulfilled') {
              disks.push(...dskRes.value.disks)
            }
          }

          this.sessions = sessions
          this.devices  = devices
          this.disks    = disks
          this.capturedAt = capturedAt || Date.now()
        } else {
          // ─── Single context (SAN ou nœud effectif d'un cluster) ───────────────
          const effId = effective.value?.id
          if (!effId) {
            this.sessions   = []
            this.devices    = []
            this.disks      = []
            this.capturedAt = Date.now()
            return
          }
          const query = { sanId: effId }
          const [sessionsRes, devicesRes, disksRes] = await Promise.all([
            $fetch<{ sessions: SessionThroughput[]; capturedAt: number }>(
              '/api/stats/sessions', { query },
            ),
            $fetch<{ devices: DeviceThroughput[]; capturedAt: number }>(
              '/api/stats/devices', { query },
            ),
            $fetch<{ disks: DiskStatThroughput[]; capturedAt: number }>(
              '/api/stats/diskstats', { query },
            ),
          ])
          this.sessions   = sessionsRes.sessions
          this.devices    = devicesRes.devices
          this.disks      = disksRes.disks
          this.capturedAt = sessionsRes.capturedAt
        }
      } catch (err) {
        this.error = (err as Error).message
      } finally {
        this.loading = false
      }
    },

    reset() {
      this.sessions   = []
      this.devices    = []
      this.disks      = []
      this.capturedAt = null
    },

    startPolling(intervalMs = 10_000) {
      this.stopPolling()
      this.fetchAll()
      this.pollInterval = setInterval(() => this.fetchAll(), intervalMs)
    },

    stopPolling() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
        this.pollInterval = null
      }
    },
  },
})

// ─── Helpers de formatage (exportés pour les composants) ─────────────────────

export function formatKbps(kbps: number): string {
  if (kbps >= 1_048_576) return `${(kbps / 1_048_576).toFixed(1)} GB/s`
  if (kbps >= 1_024) return `${(kbps / 1_024).toFixed(1)} MB/s`
  return `${kbps} KB/s`
}

export function formatKbTotal(kb: number): string {
  if (kb >= 1_073_741_824) return `${(kb / 1_073_741_824).toFixed(2)} TB`
  if (kb >= 1_048_576) return `${(kb / 1_048_576).toFixed(1)} GB`
  if (kb >= 1_024) return `${(kb / 1_024).toFixed(1)} MB`
  return `${kb} KB`
}
