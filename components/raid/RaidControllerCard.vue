<template>
  <div class="space-y-4">
    <!-- Header contrôleur -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 flex-wrap">
          <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-gray-400" />
          <h3 class="font-semibold text-gray-900 dark:text-gray-100">{{ controller.model }}</h3>
          <RaidHealthBadge :health="controller.health" />
          <UBadge
            v-if="controller.managementMode === 'read_only_limited'"
            color="amber"
            variant="soft"
            size="xs"
            label="Lecture seule limitée"
          />
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
          <span v-if="controller.pciAddress">PCI : {{ controller.pciAddress }}</span>
          <span v-if="controller.driver">Driver : {{ controller.driver }}</span>
          <span v-if="controller.serial">S/N : {{ controller.serial }}</span>
          <span v-if="controller.firmware">FW : {{ controller.firmware }}</span>
          <span class="capitalize">CLI : {{ controller.cliTool === 'none' ? 'non disponible' : controller.cliPath ?? controller.cliTool }}</span>
          <span class="capitalize">Vendeur : {{ vendorLabel }}</span>
        </div>
      </div>
      <div class="flex gap-2 shrink-0">
        <UButton
          size="xs"
          color="gray"
          variant="soft"
          icon="i-heroicons-magnifying-glass"
          @click="$emit('diagnostic', controller)"
        >
          Diagnostic
        </UButton>
        <UButton
          v-if="showMissingToolsAction"
          size="xs"
          color="amber"
          variant="soft"
          icon="i-heroicons-wrench-screwdriver"
          @click="$emit('install-perccli')"
        >
          {{ t('raid.missing_tools.install_cta') }}
        </UButton>
        <UButton
          v-if="controller.supportsCreate && !readOnly"
          size="xs"
          color="blue"
          variant="soft"
          icon="i-heroicons-plus"
          @click="$emit('create-ld', controller)"
        >
          Créer volume
        </UButton>
      </div>
    </div>

    <!-- Mode contrôleur -->
    <div class="flex items-center gap-2 flex-wrap text-sm">
      <span class="text-gray-500 dark:text-gray-400 text-xs">Mode contrôleur :</span>
      <UBadge
        :color="modeColor"
        variant="soft"
        size="xs"
        :label="modeLabel"
      />
      <span class="text-xs text-gray-400">{{ modeConfidenceLabel }}</span>
      <UPopover v-if="controller.controllerMode?.evidence?.length">
        <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-information-circle" class="p-0" />
        <template #panel>
          <div class="p-3 max-w-xs text-xs space-y-1">
            <p v-for="e in controller.controllerMode.evidence" :key="e" class="text-gray-700 dark:text-gray-300">{{ e }}</p>
          </div>
        </template>
      </UPopover>
    </div>

    <!-- Bandeau warning CLI manquante -->
    <div
      v-if="controller.managementMode === 'read_only_limited'"
      class="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 space-y-2"
    >
      <p v-for="w in controller.warnings" :key="w">{{ w }}</p>
      <ul class="text-xs mt-1 text-amber-600 dark:text-amber-400 list-disc list-inside space-y-0.5">
        <li>
          <strong>Option 1 — Réinstallation :</strong> relancer le script <code class="font-mono">esos_install</code> et sélectionner StorCLI ou PercCLI parmi les outils optionnels.
          <a
            href="https://github.com/quantum/esos/wiki/31_Hardware_RAID_Setup"
            target="_blank"
            rel="noopener noreferrer"
            class="underline ml-1"
          >Wiki ESOS §31</a>
        </li>
        <li>
          <strong>Option 2 — Modification de l'image cpio :</strong> monter <code class="font-mono">archivemount /mnt/root/PRIMARY-root.cpio.bz2 /tmp/cpio_image</code>, copier le binaire, puis démonter.
          <a
            href="https://github.com/quantum/esos/wiki/24_System_Customization"
            target="_blank"
            rel="noopener noreferrer"
            class="underline ml-1"
          >Wiki ESOS §24</a>
        </li>
      </ul>
    </div>

    <!-- Physical Drives -->
    <div v-if="controller.physicalDrives.length">
      <p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Disques physiques ({{ controller.physicalDrives.length }})</p>
      <HardwarePhysicalDrivesTable :drives="controller.physicalDrives" />
    </div>

    <!-- Logical Drives -->
    <div v-if="controller.logicalDrives.length">
      <p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Volumes logiques ({{ controller.logicalDrives.length }})</p>
      <HardwareLogicalDrivesTable
        :drives="controller.logicalDrives"
        :supports-delete="controller.supportsDelete"
        :read-only="readOnly || controller.managementMode === 'read_only_limited'"
        @delete-ld="(ld) => $emit('delete-ld', controller, ld)"
      />
    </div>

    <div v-if="!controller.physicalDrives.length && !controller.logicalDrives.length" class="text-sm text-gray-500 dark:text-gray-400 italic">
      {{ controller.managementMode === 'read_only_limited'
        ? 'Aucun volume exposé par le kernel (lsscsi). Vérifiez que les volumes RAID sont configurés via le BIOS du contrôleur, puis redémarrez ESOS.'
        : 'Aucun disque ou volume détecté' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HardwareRaidController, HardwareRaidLogicalDrive } from '~/types/raid'

const props = defineProps<{ controller: HardwareRaidController; readOnly?: boolean; showMissingToolsAction?: boolean }>()
defineEmits<{
  'create-ld': [ctrl: HardwareRaidController]
  'delete-ld': [ctrl: HardwareRaidController, ld: HardwareRaidLogicalDrive]
  'diagnostic': [ctrl: HardwareRaidController]
  'install-perccli': []
}>()

const { t } = useEsosI18n()

const vendorLabel = computed(() => ({
  lsi_megaraid: 'LSI MegaRAID',
  dell_perc: 'Dell PERC',
  adaptec_aacraid: 'Adaptec',
  unknown: 'Inconnu',
}[props.controller.vendor] ?? props.controller.vendor))

const modeLabel = computed(() => ({
  raid: 'Mode RAID',
  hba: 'Mode HBA / non-RAID',
  mixed: 'Mode Mixte',
  unknown: 'Mode inconnu',
}[props.controller.controllerMode?.mode ?? 'unknown']))

const modeColor = computed((): 'blue' | 'green' | 'orange' | 'gray' => ({
  raid: 'blue',
  hba: 'green',
  mixed: 'orange',
  unknown: 'gray',
}[props.controller.controllerMode?.mode ?? 'unknown'] as 'blue' | 'green' | 'orange' | 'gray'))

const modeConfidenceLabel = computed(() => {
  const c = props.controller.controllerMode
  if (!c) return ''
  const conf = { high: 'haute', medium: 'moyenne', low: 'faible' }[c.confidence] ?? c.confidence
  return `(confiance ${conf})`
})
</script>
