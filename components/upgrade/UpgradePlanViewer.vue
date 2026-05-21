<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <UButton
        color="primary"
        icon="i-heroicons-document-text"
        :loading="upgradeStore.planLoading"
        :disabled="!canGenerate"
        @click="emit('generate')"
      >
        {{ t('admin.upgrade.plan.generate') }}
      </UButton>
      <span v-if="upgradeStore.plan" class="text-xs text-gray-500 dark:text-gray-400">
        {{ upgradeStore.plan.mode === 'cluster_rolling'
          ? t('admin.upgrade.plan.cluster_rolling')
          : t('admin.upgrade.plan.standalone') }}
      </span>
    </div>

    <UAlert
      v-if="upgradeStore.planError"
      color="red"
      variant="soft"
      :title="upgradeStore.planError"
    />

    <template v-if="upgradeStore.plan">
      <UAlert color="amber" variant="soft">
        <ul class="text-sm space-y-1 list-disc list-inside">
          <li v-for="w in upgradeStore.plan.globalWarnings" :key="w">
            {{ t(w) }}
          </li>
        </ul>
      </UAlert>

      <div
        v-for="node in upgradeStore.plan.nodes"
        :key="node.sanId"
        class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div class="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <span class="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {{ node.order }}. {{ node.label }}
          </span>
        </div>
        <ol class="divide-y divide-gray-100 dark:divide-gray-800">
          <li
            v-for="step in node.steps"
            :key="step.id"
            class="px-4 py-3 space-y-2"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ t(`admin.upgrade.plan.step_kind.${step.kind}`) }}
              </span>
              <UBadge v-if="step.manual" size="xs" color="amber" variant="subtle">
                {{ t('admin.upgrade.plan.manual_step') }}
              </UBadge>
            </div>
            <pre
              v-if="step.commands.length"
              class="esos-command-pre text-xs max-h-40 overflow-auto"
            >{{ step.commands.join('\n') }}</pre>
            <UButton
              v-if="step.commands.length"
              size="xs"
              variant="ghost"
              @click="copyCommands(step.commands)"
            >
              {{ t('admin.upgrade.plan.copy_commands') }}
            </UButton>
          </li>
        </ol>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ canGenerate: boolean }>()
const emit = defineEmits<{ (e: 'generate'): void }>()

const { t } = useEsosI18n()
const upgradeStore = useUpgradeStore()

function copyCommands(commands: string[]) {
  void navigator.clipboard.writeText(commands.join('\n'))
}
</script>
