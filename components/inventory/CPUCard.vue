<template>
  <div>
    <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Processeur</h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <StatItem label="Modèle"         :value="cpu.modelName"                         wide />
      <StatItem label="Architecture"   :value="cpu.architecture" />
      <StatItem label="Sockets"        :value="String(cpu.sockets)" />
      <StatItem label="Cœurs physiques" :value="String(cpu.physicalCores)" />
      <StatItem label="Cœurs logiques" :value="String(cpu.logicalCores)" />
      <StatItem label="Threads/cœur"   :value="String(cpu.threadsPerCore)" />
      <StatItem v-if="cpu.maxMhz"  label="Fréq. max" :value="`${cpu.maxMhz} MHz`" />
      <StatItem v-if="cpu.l3Cache" label="Cache L3"  :value="cpu.l3Cache" />
      <StatItem v-if="cpu.numaNodes && cpu.numaNodes > 1" label="NUMA nodes" :value="String(cpu.numaNodes)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CPUInfo } from '~/server/utils/types'
defineProps<{ cpu: CPUInfo }>()
</script>
