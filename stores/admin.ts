import { defineStore } from 'pinia'

interface SSHFormState {
  host:       string
  port:       number
  username:   string
  authType:   'key' | 'password'
  privateKey: string
  password:   string
}

interface CollectorSettings {
  enabled:        boolean
  intervalSec:    number
  retentionHours: number
}

export type { AlertThresholdForm } from '~/utils/alert-thresholds-validation'
import type { AlertThresholdForm } from '~/utils/alert-thresholds-validation'

function mapAlertThresholdsFromSettings(settings: Record<string, string>): AlertThresholdForm {
  return {
    volumeWarnPct:     parseInt(settings['alerts.volume_warn_pct'] ?? '75', 10),
    volumeCriticalPct: parseInt(settings['alerts.volume_critical_pct'] ?? '90', 10),
    sessionEnabled:    settings['alerts.session_enabled'] !== 'false',
    sessionPolicy:     settings['alerts.session_policy'] === 'multipath' ? 'multipath' : 'strict',
    sessionGraceSec:   parseInt(settings['alerts.session_grace_sec'] ?? '120', 10),
    sessionMinActive:  parseInt(settings['alerts.session_min_active'] ?? '1', 10),
    fcPortEnabled:     settings['alerts.fc_port_enabled'] !== 'false',
  }
}

export const useAdminStore = defineStore('admin', {
  state: () => ({
    settings:   null as Record<string, string> | null,
    systemInfo: null as any,
    sshForm:    null as SSHFormState | null,
    collector:  null as CollectorSettings | null,
    alertThresholds: null as AlertThresholdForm | null,
    loading:    false,
    testResult: null as { success: boolean; latencyMs?: number; error?: string } | null,
  }),

  actions: {
    async fetchAll() {
      this.loading = true
      try {
        const [settings, sysInfo] = await Promise.all([
          $fetch<Record<string, string>>('/api/admin/settings'),
          $fetch('/api/admin/system-info'),
        ])
        this.settings   = settings
        this.systemInfo = sysInfo

        // Hydrater le formulaire SSH
        this.sshForm = {
          host:       settings['ssh.host']      ?? '',
          port:       parseInt(settings['ssh.port'] ?? '22', 10),
          username:   settings['ssh.username']  ?? 'root',
          authType:   (settings['ssh.auth_type'] ?? 'key') as 'key' | 'password',
          privateKey: '', // Jamais pré-rempli (secret)
          password:   '',
        }

        // Hydrater les paramètres collecteur
        this.collector = {
          enabled:        settings['collector.enabled'] === 'true',
          intervalSec:    parseInt(settings['collector.interval_sec']    ?? '30', 10),
          retentionHours: parseInt(settings['collector.retention_hours'] ?? '24', 10),
        }
        this.alertThresholds = mapAlertThresholdsFromSettings(settings)
      } finally {
        this.loading = false
      }
    },

    async saveSSH(form: SSHFormState) {
      await $fetch('/api/admin/ssh', {
        method: 'POST',
        body:   form,
      })
      await this.fetchAll()
    },

    async testSSH(form: SSHFormState) {
      this.testResult = null
      this.testResult = await $fetch('/api/admin/ssh/test', {
        method: 'POST',
        body:   form,
      })
    },

    async saveCollector(settings: CollectorSettings) {
      await $fetch('/api/admin/settings', {
        method: 'PATCH',
        body: {
          'collector.enabled':         String(settings.enabled),
          'collector.interval_sec':    String(settings.intervalSec),
          'collector.retention_hours': String(settings.retentionHours),
        },
      })
      this.collector = settings
    },

    async saveAlertThresholds(form: AlertThresholdForm) {
      await $fetch('/api/admin/settings', {
        method: 'PATCH',
        body: {
          'alerts.volume_warn_pct':       String(form.volumeWarnPct),
          'alerts.volume_critical_pct':   String(form.volumeCriticalPct),
          'alerts.session_enabled':       String(form.sessionEnabled),
          'alerts.session_policy':        form.sessionPolicy,
          'alerts.session_grace_sec':     String(form.sessionGraceSec),
          'alerts.session_min_active':    String(form.sessionMinActive),
          'alerts.fc_port_enabled':       String(form.fcPortEnabled),
        },
      })
      await this.fetchAll()
    },

    async purgeMetrics() {
      const result = await $fetch<{ deleted: number }>('/api/admin/metrics/purge', { method: 'POST' })
      useToast().add({ title: `${result.deleted} samples supprimés`, color: 'green' })
      await this.fetchAll()
    },

    async clearCache() {
      await $fetch('/api/admin/cache/clear', { method: 'POST' })
      useToast().add({ title: 'Cache vidé', color: 'green' })
    },
  },
})
