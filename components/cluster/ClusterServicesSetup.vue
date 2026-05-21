<template>
  <div class="space-y-5">
    <div>
      <h3 class="font-semibold text-gray-800 dark:text-gray-200">{{ t('cluster.services_setup.title') }}</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ t('cluster.services_setup.intro') }}</p>
    </div>

    <UAlert
      color="amber"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :title="t('cluster.services_setup.scst_alert_title')"
      :description="t('cluster.services_setup.scst_alert_desc')"
    />

    <div
      v-for="node in props.nodes"
      :key="node.id"
      class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      <div class="px-4 py-2.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ node.label }}
          <span class="font-mono text-gray-400 font-normal ml-1">{{ node.host }}</span>
        </p>
        <div class="flex items-center gap-1.5">
          <span
            v-if="nodeReady(node.id)"
            class="flex items-center gap-1 text-xs text-green-600 font-medium"
          >
            <UIcon name="i-heroicons-check-circle" class="w-4 h-4" /> {{ t('cluster.services_setup.ready') }}
          </span>
          <span v-else class="text-xs text-gray-400">{{ t('cluster.services_setup.waiting') }}</span>
        </div>
      </div>

      <div class="p-4 space-y-3">
        <div class="space-y-2">
          <div
            v-for="(step, idx) in getSteps(node.id)"
            :key="step.key"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
            :class="[
              step.done  ? 'bg-green-50 border border-green-200' :
              step.active ? 'bg-blue-50 border border-blue-200' :
                            'bg-gray-50 border border-gray-200 opacity-50'
            ]"
          >
            <div
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              :class="[
                step.done   ? 'bg-green-500 text-white' :
                step.active ? 'bg-blue-500 text-white' :
                              'bg-gray-300 text-gray-500'
              ]"
            >
              <UIcon v-if="step.done" name="i-heroicons-check" class="w-3.5 h-3.5" />
              <span v-else>{{ idx + 1 }}</span>
            </div>

            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium" :class="step.done ? 'text-green-700' : step.active ? 'text-blue-800' : 'text-gray-400'">
                {{ step.label }}
              </p>
              <p v-if="!step.done && step.hint" class="text-xs text-gray-400 mt-0.5">{{ step.hint }}</p>
            </div>

            <span
              v-if="verifying[`${node.id}:${step.key}`]"
              class="flex items-center gap-1 text-xs text-blue-600 font-medium shrink-0"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
              {{ t('cluster.services_setup.verifying') }}
            </span>
            <UButton
              v-else-if="!step.done"
              :label="step.action"
              size="xs"
              :color="step.active ? 'blue' : 'gray'"
              :variant="step.active ? 'solid' : 'outline'"
              :disabled="!step.active"
              :loading="pending[`${node.id}:${step.key}`]"
              @click="runStep(node.id, step)"
            />
            <UIcon
              v-else
              name="i-heroicons-check-circle"
              class="w-5 h-5 text-green-500 shrink-0"
            />
          </div>
        </div>

        <div
          v-if="lastOutput[node.id] && !nodeReady(node.id)"
          class="rounded bg-gray-900 text-green-400 text-xs p-2.5 font-mono max-h-24 overflow-y-auto whitespace-pre-wrap"
        >{{ lastOutput[node.id] }}</div>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <UButton
        v-if="allReady"
        :label="t('cluster.services_setup.continue')"
        icon="i-heroicons-arrow-right"
        trailing
        @click="emit('services-ready')"
      />
      <UButton
        :label="t('cluster.services_setup.refresh_status')"
        icon="i-heroicons-arrow-path"
        color="gray"
        variant="ghost"
        :loading="refreshing"
        @click="refreshStatus"
      />
    </div>

    <UDivider class="my-1" />
    <div class="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 px-4 py-3 space-y-3">
      <div class="flex items-start gap-2">
        <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p class="text-sm font-semibold text-blue-800">{{ t('cluster.services_setup.drbd_title') }}</p>
          <p class="text-xs text-blue-600 mt-0.5">
            {{ t('cluster.services_setup.drbd_body') }}
          </p>
        </div>
      </div>

      <div class="flex items-center justify-between text-sm">
        <div>
          <p class="text-blue-800 font-medium">{{ t('cluster.services_setup.drbd_standalone_title') }}</p>
          <p class="text-xs text-blue-500 mt-0.5">{{ t('cluster.services_setup.drbd_standalone_hint') }}</p>
        </div>
        <USwitch
          v-model="drbdStandalone"
          size="sm"
          :disabled="togglingDRBD"
          @update:model-value="toggleDRBD"
        />
      </div>

      <UAlert
        v-if="drbdStandalone"
        color="amber"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :title="t('cluster.services_setup.drbd_standalone_alert_title')"
        :description="t('cluster.services_setup.drbd_standalone_alert_desc')"
        size="sm"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface NodeInfo { id: string; label: string; host: string }

interface Step {
  key:     string
  label:   string
  action:  string
  hint?:   string
  done:    boolean
  active:  boolean
  service: 'corosync' | 'pacemaker'
  act:     'enable' | 'start'
}

interface NodeStatus {
  corosyncEnabled:  boolean
  corosyncRunning:  boolean
  pacemakerEnabled: boolean
  pacemakerRunning: boolean
}

const props = defineProps<{ nodes: NodeInfo[] }>()
const emit  = defineEmits<{ (e: 'services-ready'): void }>()
const { t } = useEsosI18n()

const pending       = ref<Record<string, boolean>>({})
const verifying     = ref<Record<string, boolean>>({})
const lastOutput    = ref<Record<string, string>>({})
const nodeStatus    = ref<Record<string, NodeStatus>>({})
const refreshing    = ref(false)

const allReady = computed(() => props.nodes.every(n => nodeReady(n.id)))

function nodeReady(nodeId: string): boolean {
  const s = nodeStatus.value[nodeId]
  return !!(s?.corosyncRunning && s?.pacemakerRunning)
}

function getSteps(nodeId: string): Step[] {
  const s = nodeStatus.value[nodeId] ?? {
    corosyncEnabled: false, corosyncRunning: false,
    pacemakerEnabled: false, pacemakerRunning: false,
  }

  return [
    {
      key:     'corosync:enable',
      label:   t('cluster.services_setup.steps.corosync_enable'),
      action:  t('cluster.services_setup.actions.enable'),
      hint:    t('cluster.services_setup.steps.corosync_enable_hint'),
      done:    s.corosyncEnabled,
      active:  !s.corosyncEnabled,
      service: 'corosync',
      act:     'enable',
    },
    {
      key:     'corosync:start',
      label:   t('cluster.services_setup.steps.corosync_start'),
      action:  t('cluster.services_setup.actions.start'),
      hint:    t('cluster.services_setup.steps.corosync_start_hint'),
      done:    s.corosyncRunning,
      active:  s.corosyncEnabled && !s.corosyncRunning,
      service: 'corosync',
      act:     'start',
    },
    {
      key:     'pacemaker:enable',
      label:   t('cluster.services_setup.steps.pacemaker_enable'),
      action:  t('cluster.services_setup.actions.enable'),
      hint:    t('cluster.services_setup.steps.pacemaker_enable_hint'),
      done:    s.pacemakerEnabled,
      active:  s.corosyncRunning && !s.pacemakerEnabled,
      service: 'pacemaker',
      act:     'enable',
    },
    {
      key:     'pacemaker:start',
      label:   t('cluster.services_setup.steps.pacemaker_start'),
      action:  t('cluster.services_setup.actions.start'),
      hint:    t('cluster.services_setup.steps.pacemaker_start_hint'),
      done:    s.pacemakerRunning,
      active:  s.pacemakerEnabled && !s.pacemakerRunning,
      service: 'pacemaker',
      act:     'start',
    },
  ]
}

async function runStep(nodeId: string, step: Step) {
  const key = `${nodeId}:${step.key}`
  pending.value[key]   = true
  verifying.value[key] = false
  lastOutput.value[nodeId] = ''
  try {
    const res = await $fetch<{ output: string }>('/api/cluster/service', {
      method: 'POST',
      body:   { nodeId, service: step.service, action: step.act },
    })
    lastOutput.value[nodeId] = res.output.trim().slice(0, 400) || t('cluster.services_setup.success_output')

    pending.value[key]   = false
    verifying.value[key] = true
    const confirmed = await pollUntilDone(nodeId, step)
    if (confirmed) {
      lastOutput.value[nodeId] = ''
    } else {
      lastOutput.value[nodeId] += `\n${t('cluster.services_setup.poll_timeout')}`
    }
  } catch (err: any) {
    lastOutput.value[nodeId] = t('cluster.services_setup.error_prefix', {
      message: err?.data?.message ?? String(err),
    })
  } finally {
    pending.value[key]   = false
    verifying.value[key] = false
  }
}

async function pollUntilDone(nodeId: string, step: Step): Promise<boolean> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2_000))
    await refreshStatus()
    const s = nodeStatus.value[nodeId]
    if (!s) continue
    const confirmed =
      (step.act === 'enable' && step.service === 'corosync'  && s.corosyncEnabled)  ||
      (step.act === 'start'  && step.service === 'corosync'  && s.corosyncRunning)  ||
      (step.act === 'enable' && step.service === 'pacemaker' && s.pacemakerEnabled) ||
      (step.act === 'start'  && step.service === 'pacemaker' && s.pacemakerRunning)
    if (confirmed) return true
  }
  return false
}

async function refreshStatus() {
  refreshing.value = true
  const ids = props.nodes.map(n => n.id).join(',')
  try {
    const res = await $fetch<{ nodes: Array<NodeStatus & { nodeId: string }> }>('/api/cluster/status', {
      query: { nodeIds: ids },
    })
    for (const n of res.nodes ?? []) {
      nodeStatus.value[n.nodeId] = {
        corosyncEnabled:  n.corosyncEnabled,
        corosyncRunning:  n.corosyncRunning,
        pacemakerEnabled: n.pacemakerEnabled,
        pacemakerRunning: n.pacemakerRunning,
      }
    }
  } catch { /* silencieux */ } finally {
    refreshing.value = false
  }
}

onMounted(refreshStatus)

const drbdStandalone = ref(false)
const togglingDRBD   = ref(false)

async function toggleDRBD(value: boolean) {
  togglingDRBD.value = true
  const action: 'enable' | 'disable' = value ? 'enable' : 'disable'
  const errors: string[] = []

  await Promise.all(props.nodes.map(async (node) => {
    try {
      await $fetch('/api/cluster/service', {
        method: 'POST',
        body:   { nodeId: node.id, service: 'drbd', action },
      })
    } catch (err: any) {
      errors.push(`${node.label}: ${err?.data?.message ?? t('cluster.toasts.unknown_error')}`)
    }
  }))

  if (errors.length > 0) {
    useAppToast().error(t('cluster.toasts.drbd_toggle_error'), errors.join(' | '))
    drbdStandalone.value = !value
  }
  togglingDRBD.value = false
}
</script>
