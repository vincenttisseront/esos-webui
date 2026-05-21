<template>
  <div class="space-y-4">
    <div>
      <h3 class="font-semibold text-gray-800 dark:text-gray-200">{{ t('cluster.prereq.title') }}</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t('cluster.prereq.intro') }}</p>
    </div>

    <div class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 flex items-start gap-2">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div class="text-xs text-amber-700 space-y-1">
        <p class="font-semibold">{{ t('cluster.prereq.iscsi_impact_title') }}</p>
        <p>{{ t('cluster.prereq.iscsi_impact_body') }}</p>
      </div>
    </div>

    <div class="space-y-3">
      <div
        v-for="node in props.nodes"
        :key="node.id"
        class="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
      >
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          {{ node.label }} — <span class="font-mono text-gray-400">{{ node.host }}</span>
        </p>
        <div class="space-y-1.5">
          <div v-if="!nodeChecks[node.id]" class="flex items-center gap-2 text-sm text-gray-400">
            <span class="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {{ t('cluster.prereq.checking') }}
          </div>

          <div
            v-for="check in nodeChecks[node.id] ?? []"
            :key="check.label"
            class="flex items-center gap-2 text-xs"
          >
            <UIcon
              :name="check.ok ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
              class="w-4 h-4 shrink-0"
              :class="check.ok ? 'text-green-500' : 'text-red-400'"
            />
            <span :class="check.ok ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 font-medium'">{{ check.label }}</span>

            <template v-if="!check.ok && check.label.includes('SCST')">
              <UButton
                size="2xs"
                color="amber"
                variant="soft"
                :loading="fixing[node.id]"
                :label="t('cluster.prereq.fix')"
                icon="i-heroicons-wrench"
                class="ml-auto shrink-0"
                @click="fixScst(node.id)"
              />
            </template>
            <span
              v-else-if="!check.ok && check.detail"
              class="text-gray-400 truncate ml-auto"
            >{{ check.detail }}</span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="fixMessage"
      class="rounded-lg border p-2.5 text-xs flex items-center gap-2"
      :class="fixMessage.ok ? 'border-green-200 bg-green-50 dark:bg-green-950/40 text-green-700' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-600'"
    >
      <UIcon
        :name="fixMessage.ok ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
        class="w-4 h-4 shrink-0"
      />
      {{ fixMessage.text }}
    </div>

    <div class="flex gap-2">
      <UButton
        v-if="allOk"
        :label="t('cluster.prereq.validated_continue')"
        icon="i-heroicons-arrow-right"
        trailing
        @click="emit('all-ok')"
      />
      <UButton
        :label="t('cluster.prereq.rerun')"
        icon="i-heroicons-arrow-path"
        color="gray"
        :loading="loading"
        @click="runChecks"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface NodeInfo { id: string; label: string; host: string }
interface Check    { label: string; ok: boolean; detail: string }

const props = defineProps<{ nodes: NodeInfo[] }>()
const emit  = defineEmits<{ (e: 'all-ok'): void }>()
const { t } = useEsosI18n()

const loading    = ref(false)
const fixing     = ref<Record<string, boolean>>({})
const fixMessage = ref<{ ok: boolean; text: string } | null>(null)
const nodeChecks = ref<Record<string, Check[]>>({})

const allOk = computed(() =>
  props.nodes.length > 0 &&
  props.nodes.every(n => nodeChecks.value[n.id]?.every(c => c.ok)),
)

async function runChecks() {
  loading.value    = true
  nodeChecks.value = {}
  fixMessage.value = null

  try {
    const sanIds = props.nodes.map(n => n.id)
    const results = await $fetch<Array<{ sanId: string; checks: Check[] }>>(
      '/api/cluster/prereq',
      { query: { sanIds } },
    )
    for (const r of results) {
      nodeChecks.value[r.sanId] = r.checks
    }
  } catch (err: any) {
    for (const n of props.nodes) {
      nodeChecks.value[n.id] = [{
        label: t('cluster.prereq.api_error'),
        ok: false,
        detail: err?.data?.message ?? String(err),
      }]
    }
  } finally {
    loading.value = false
  }

  if (allOk.value) emit('all-ok')
}

async function fixScst(nodeId: string) {
  fixing.value[nodeId] = true
  fixMessage.value     = null
  try {
    await $fetch('/api/cluster/service', {
      method: 'POST',
      body:   { nodeId, service: 'scst', action: 'disable' },
    })
    fixMessage.value = {
      ok:   true,
      text: t('cluster.prereq.fix_success'),
    }
    await runChecks()
  } catch (err: any) {
    fixMessage.value = {
      ok:   false,
      text: t('cluster.prereq.fix_failed', { message: err?.data?.message ?? String(err) }),
    }
  } finally {
    fixing.value[nodeId] = false
  }
}

onMounted(runChecks)
</script>
