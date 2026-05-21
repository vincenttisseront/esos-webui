<script setup lang="ts">
/**
 * Widget compact affichant le débit I/O agrégé relatif à la bande passante
 * maximale disponible (somme des ports FC/iSCSI Online).
 * En mode multi-SAN agrégé, les barres sont relatives entre elles.
 */
const { t } = useEsosI18n()
const stats = useStatsStore()
const hw    = useHardwareStore()
const { isAll, activeSans } = useSelectedSan()

// ─── Bande passante max cumulée ───────────────────────────────────────────────
// 1 Gbps FC = 125 000 KB/s (1 Gbps = 125 MB/s)
function parseSpeedKbps(speed: string): number {
  const m = speed.match(/([\d.]+)\s*Gbit/i)
  if (!m) return 0
  return parseFloat(m[1]) * 125_000 // Gbps → KB/s
}

const onlinePorts = computed(() =>
  (hw.data?.fcPorts ?? []).filter(p => p.portState === 'Online'),
)

/** Débit max théorique en KB/s — null en mode agrégé ou si aucun port connu */
const maxKbps = computed<number | null>(() => {
  if (isAll.value || !hw.data) return null
  const total = onlinePorts.value.reduce((acc, p) => acc + parseSpeedKbps(p.speed), 0)
  return total > 0 ? total : null
})

/** Label de contexte dans l'en-tête */
const capacityLabel = computed(() => {
  if (isAll.value) {
    const n = activeSans.value.length
    return t('monitoring.throughput.capacityAggregated', { count: n }) as string
  }
  if (!hw.data) return null
  const ports = onlinePorts.value
  if (ports.length === 0) return null

  const counts = new Map<string, number>()
  for (const p of ports) {
    const key = p.speed.replace(/\s+/g, ' ').trim()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const parts = [...counts.entries()].map(([spd, n]) => `${n}× ${spd}`).join(' + ')
  const maxKbVal = maxKbps.value ?? 0
  const maxFormatted = maxKbVal >= 1_000_000
    ? `${(maxKbVal / 1_000_000).toFixed(1)} GB/s`
    : `${(maxKbVal / 1_000).toFixed(0)} MB/s`

  // Si ports issus de SCST (pas de vitesse connue), ne pas afficher la bande passante max
  const allScst = ports.every(p => p.source === 'scst')
  if (allScst) {
    return t('monitoring.throughput.capacitySpeedUnknown', { count: ports.length }) as string
  }

  return t('monitoring.throughput.capacityMaxLine', { parts, maxFormatted }) as string
})

/** Bannière quand aucun port Online (trafic présent ou non) */
const noPortBanner = computed((): { kind: 'traffic' | 'none'; label: string } | null => {
  const hasTraffic = stats.totalReadKbps > 0 || stats.totalWriteKbps > 0
  if (!hw.data) return null
  if (onlinePorts.value.length > 0) return null
  if (hasTraffic) {
    return {
      kind: 'traffic',
      label: t('monitoring.throughput.noPortTrafficUndetected') as string,
    }
  }
  return {
    kind: 'none',
    label: t('monitoring.throughput.noPortNoneOnline') as string,
  }
})

// ─── Pourcentages ─────────────────────────────────────────────────────────────
function pct(kbps: number): number {
  if (maxKbps.value) return Math.min(100, (kbps / maxKbps.value) * 100)
  // Pas de référence → barres relatives entre elles
  const sum = stats.totalReadKbps + stats.totalWriteKbps || 1
  return Math.min(100, (kbps / sum) * 100)
}

const readPct  = computed(() => pct(stats.totalReadKbps))
const writePct = computed(() => pct(stats.totalWriteKbps))

// ─── Couleurs des barres selon la charge ──────────────────────────────────────
function barColor(p: number, base: 'blue' | 'orange'): string {
  // En mode agrégé les barres sont relatives : pas d'alerte de saturation
  if (!isAll.value && p >= 90) return 'bg-red-500'
  if (!isAll.value && p >= 70) return base === 'blue' ? 'bg-blue-400' : 'bg-orange-400'
  return base === 'blue' ? 'bg-blue-500' : 'bg-orange-400'
}
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
    <!-- En-tête -->
    <div class="flex items-center justify-between mb-3">
      <p class="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">
        {{ t('monitoring.throughput.title') }}
      </p>
      <span v-if="capacityLabel" class="text-[11px] text-gray-400 font-mono">
        {{ capacityLabel }}
      </span>
      <span
        v-else-if="noPortBanner"
        class="text-[11px]"
        :class="noPortBanner.kind === 'traffic' ? 'text-orange-400' : 'text-gray-400'"
      >
        {{ noPortBanner.label }}
      </span>
    </div>

    <!-- Read -->
    <div class="flex items-center gap-3 mb-2">
      <span class="w-12 text-xs text-blue-600 font-medium text-right shrink-0">{{ t('monitoring.throughput.readLabel') }}</span>
      <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div
          class="h-2.5 rounded-full transition-all duration-500"
          :class="barColor(readPct, 'blue')"
          :style="{ width: readPct + '%' }"
        />
      </div>
      <div class="w-28 text-right shrink-0">
        <span class="text-xs font-mono text-blue-700 dark:text-blue-400">{{ stats.totalReadFormatted }}</span>
        <span v-if="maxKbps" class="text-[10px] text-gray-400 ml-1">({{ readPct.toFixed(0) }}%)</span>
      </div>
    </div>

    <!-- Write -->
    <div class="flex items-center gap-3">
      <span class="w-12 text-xs text-orange-500 font-medium text-right shrink-0">{{ t('monitoring.throughput.writeLabel') }}</span>
      <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div
          class="h-2.5 rounded-full transition-all duration-500"
          :class="barColor(writePct, 'orange')"
          :style="{ width: writePct + '%' }"
        />
      </div>
      <div class="w-28 text-right shrink-0">
        <span class="text-xs font-mono text-orange-600 dark:text-orange-400">{{ stats.totalWriteFormatted }}</span>
        <span v-if="maxKbps" class="text-[10px] text-gray-400 ml-1">({{ writePct.toFixed(0) }}%)</span>
      </div>
    </div>
  </div>
</template>
