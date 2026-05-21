<template>
  <div class="space-y-4">
    <div>
      <h3 class="font-semibold text-gray-800 dark:text-gray-200">Vérification du quorum Corosync</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Le quorum doit être actif sur les deux nœuds pour que le cluster soit opérationnel.
        La vérification est automatique — attendez que les deux nœuds passent au vert.
      </p>
    </div>

    <div class="space-y-3">
      <div
        v-for="node in props.nodes"
        :key="node.id"
        class="rounded-lg border p-4 transition-colors"
        :class="quorumStatus[node.id] ? 'border-green-200 bg-green-50 dark:bg-green-950/40' : 'border-gray-200 dark:border-gray-700'"
      >
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ node.label }}</p>
          <div class="flex items-center gap-1.5">
            <span
              class="w-2 h-2 rounded-full"
              :class="quorumStatus[node.id] === undefined
                ? 'bg-gray-300 animate-pulse'
                : quorumStatus[node.id] ? 'bg-green-500' : 'bg-red-400'"
            />
            <span class="text-xs" :class="quorumStatus[node.id] ? 'text-green-700' : 'text-gray-400'">
              {{ quorumStatus[node.id] === undefined ? 'Vérification…' : quorumStatus[node.id] ? 'Quorum OK' : 'Sans quorum' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="flex gap-2 items-center">
      <UButton
        v-if="allQuorate"
        label="Quorum actif — Continuer"
        icon="i-heroicons-arrow-right"
        trailing
        @click="emit('quorum-ok')"
      />
      <UButton
        label="Vérifier"
        icon="i-heroicons-arrow-path"
        color="gray"
        :loading="loading"
        @click="check"
      />
      <span v-if="!allQuorate && polled" class="text-xs text-gray-400">
        Nouvelle vérification dans {{ countdown }}s…
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface NodeInfo { id: string; label: string; host: string }

const props = defineProps<{ nodes: NodeInfo[] }>()
const emit  = defineEmits<{ (e: 'quorum-ok'): void }>()

const loading      = ref(false)
const polled       = ref(false)
const countdown    = ref(10)
const quorumStatus = ref<Record<string, boolean | undefined>>({})

const allQuorate = computed(() =>
  props.nodes.length > 0 &&
  props.nodes.every(n => quorumStatus.value[n.id] === true),
)

async function check() {
  loading.value = true
  const ids = props.nodes.map(n => n.id).join(',')
  try {
    const res = await $fetch<{ nodes: Array<{ nodeId: string; quorate: boolean }> }>('/api/cluster/status', {
      query: { nodeIds: ids },
    })
    for (const n of res.nodes) {
      quorumStatus.value[n.nodeId] = n.quorate
    }
  } catch { /* silencieux */ } finally {
    loading.value = false
    polled.value  = true
  }
  if (allQuorate.value) {
    // Délai pour que l'utilisateur voie le statut vert avant de passer à l'étape suivante
    await new Promise(r => setTimeout(r, 2_000))
    emit('quorum-ok')
  }
}

// Polling toutes les 10s tant que pas de quorum
let timer: ReturnType<typeof setInterval> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  check()
  timer = setInterval(() => { check() }, 10_000)
  countdownTimer = setInterval(() => {
    countdown.value = countdown.value <= 1 ? 10 : countdown.value - 1
  }, 1_000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>
